import process from "node:process";
import type { EnvConfig } from "../config/env";
import type {
  FastVmCommandResult,
  FastVmMachine,
  FastVmSnapshot
} from "../types";

type FastVmAction =
  | "launch"
  | "restore"
  | "run"
  | "snapshot"
  | "remove"
  | "remove_snapshot"
  | "list_snapshots";

interface BridgeRequest {
  action: FastVmAction;
  machine?: string;
  name?: string;
  vm?: string;
  snapshot?: string;
  command?: string;
  timeoutSec?: number;
}

interface BridgeResponse {
  ok: boolean;
  machine?: FastVmMachine;
  snapshot?: FastVmSnapshot;
  snapshots?: FastVmSnapshot[];
  result?: FastVmCommandResult;
  error?: string;
}

export class FastVmClient {
  constructor(private readonly env: EnvConfig) {}

  async launch(machine = "c1m2", name?: string): Promise<FastVmMachine> {
    const response = await this.invoke({
      action: "launch",
      machine,
      name
    });

    return this.requireMachine(response);
  }

  async restore(snapshot: string, name?: string): Promise<FastVmMachine> {
    const response = await this.invoke({
      action: "restore",
      snapshot,
      name
    });

    return this.requireMachine(response);
  }

  async run(vmId: string, command: string, timeoutSec?: number): Promise<FastVmCommandResult> {
    const response = await this.invoke({
      action: "run",
      vm: vmId,
      command,
      timeoutSec
    });

    if (!response.result) {
      throw new Error("FastVM bridge did not return a command result");
    }

    return response.result;
  }

  async snapshot(vmId: string, name: string): Promise<FastVmSnapshot> {
    const response = await this.invoke({
      action: "snapshot",
      vm: vmId,
      name
    });

    if (!response.snapshot) {
      throw new Error("FastVM bridge did not return a snapshot");
    }

    return response.snapshot;
  }

  async remove(vmId: string): Promise<void> {
    await this.invoke({
      action: "remove",
      vm: vmId
    });
  }

  async removeSnapshot(snapshotId: string): Promise<void> {
    await this.invoke({
      action: "remove_snapshot",
      snapshot: snapshotId
    });
  }

  async listSnapshots(): Promise<FastVmSnapshot[]> {
    const response = await this.invoke({
      action: "list_snapshots"
    });

    return response.snapshots ?? [];
  }

  private async invoke(payload: BridgeRequest): Promise<BridgeResponse> {
    const childProcess = Bun.spawn(["python3", "scripts/fastvm_bridge.py"], {
      cwd: process.cwd(),
      env: {
        ...Bun.env,
        FASTVM_API_KEY: this.env.fastVmApiKey,
        FASTVM_BASE_URL: this.env.fastVmBaseUrl
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe"
    });

    const body = JSON.stringify(payload);
    childProcess.stdin.write(body);
    childProcess.stdin.end();

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text(),
      childProcess.exited
    ]);

    if (exitCode !== 0) {
      throw new Error(stderr || stdout || "FastVM bridge exited with an error");
    }

    const response = JSON.parse(stdout) as BridgeResponse;
    if (!response.ok) {
      throw new Error(response.error ?? "FastVM bridge returned an unknown error");
    }

    return response;
  }

  private requireMachine(response: BridgeResponse): FastVmMachine {
    if (!response.machine) {
      throw new Error("FastVM bridge did not return a machine");
    }

    return response.machine;
  }
}
