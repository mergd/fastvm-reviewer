import type {
  FastVmCommandResult,
  FastVmMachine,
  FastVmSnapshot
} from "../types";
import type { FastVmClientLike } from "./runtime-client";

interface FastVmMachinePayload {
  id: string;
  name: string;
  machineName?: string;
  status: string;
  sourceName?: string;
}

interface FastVmSnapshotPayload {
  id: string;
  name: string;
  status: string;
  vmId?: string;
  createdAt?: string;
}

interface FastVmCommandPayload {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  durationMs?: number;
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

const DEFAULT_FASTVM_BASE_URL = "https://api.fastvm.org";
const DEFAULT_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 250;
const VM_ERROR_STATUSES = new Set(["error", "stopped"]);

export class FastVmClient implements FastVmClientLike {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_FASTVM_BASE_URL
  ) {
    if (!apiKey) {
      throw new Error("FASTVM_API_KEY is required");
    }
  }

  async launch(machine = "c1m2", name?: string): Promise<FastVmMachine> {
    return this.createVm({
      machineType: machine,
      name: name ?? crypto.randomUUID()
    });
  }

  async restore(snapshot: string, name?: string): Promise<FastVmMachine> {
    return this.createVm({
      snapshotId: snapshot,
      name: name ?? crypto.randomUUID()
    });
  }

  async run(vmId: string, command: string, timeoutSec?: number): Promise<FastVmCommandResult> {
    const payload: {
      command: string[];
      timeoutSec?: number;
    } = {
      command: ["sh", "-c", command]
    };
    if (timeoutSec !== undefined) {
      payload.timeoutSec = timeoutSec;
    }

    const response = await this.request(`/v1/vms/${vmId}/exec`, {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: this.commandTimeoutMs(timeoutSec)
    });

    const result = await response.json() as FastVmCommandPayload;
    return this.mapCommandResult(result);
  }

  async snapshot(vmId: string, name: string): Promise<FastVmSnapshot> {
    const response = await this.request("/v1/snapshots", {
      method: "POST",
      body: JSON.stringify({
        vmId,
        name: name || crypto.randomUUID()
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    const snapshot = await response.json() as FastVmSnapshotPayload;
    return this.mapSnapshot(snapshot);
  }

  async remove(vmId: string): Promise<void> {
    await this.request(`/v1/vms/${vmId}`, {
      method: "DELETE"
    });
  }

  async removeSnapshot(snapshotId: string): Promise<void> {
    await this.request(`/v1/snapshots/${snapshotId}`, {
      method: "DELETE"
    });
  }

  async listSnapshots(): Promise<FastVmSnapshot[]> {
    const response = await this.request("/v1/snapshots");
    const snapshots = await response.json() as FastVmSnapshotPayload[];
    return snapshots.map((snapshot) => this.mapSnapshot(snapshot));
  }

  private async createVm(payload: {
    machineType?: string;
    snapshotId?: string;
    name: string;
  }): Promise<FastVmMachine> {
    const response = await this.request("/v1/vms", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: DEFAULT_TIMEOUT_MS
    });

    const machine = await response.json() as FastVmMachinePayload;
    if (response.status === 201) {
      return this.mapMachine(machine);
    }

    return this.waitForVmReady(machine.id, DEFAULT_TIMEOUT_MS);
  }

  private async waitForVmReady(vmId: string, timeoutMs: number): Promise<FastVmMachine> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);
      const response = await this.request(`/v1/vms/${vmId}`, {
        timeoutMs
      });
      const machine = await response.json() as FastVmMachinePayload;

      if (machine.status === "running") {
        return this.mapMachine(machine);
      }

      if (VM_ERROR_STATUSES.has(machine.status)) {
        throw new Error(`VM ${vmId} entered "${machine.status}" state`);
      }
    }

    throw new Error(`VM ${vmId} did not become ready within ${timeoutMs / 1000}s`);
  }

  private async request(path: string, options: RequestOptions = {}): Promise<Response> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          ...options.headers
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await this.buildErrorMessage(response));
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`FastVM request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async buildErrorMessage(response: Response): Promise<string> {
    const body = await response.text();
    return body
      ? `FastVM API request failed with ${response.status}: ${body}`
      : `FastVM API request failed with ${response.status}`;
  }

  private mapMachine(machine: FastVmMachinePayload): FastVmMachine {
    return {
      id: machine.id,
      name: machine.name,
      machine_name: machine.machineName ?? "",
      status: machine.status,
      source_name: machine.sourceName
    };
  }

  private mapSnapshot(snapshot: FastVmSnapshotPayload): FastVmSnapshot {
    return {
      id: snapshot.id,
      name: snapshot.name,
      status: snapshot.status,
      vm_id: snapshot.vmId,
      created_at: snapshot.createdAt
    };
  }

  private mapCommandResult(result: FastVmCommandPayload): FastVmCommandResult {
    return {
      exit_code: result.exitCode ?? -1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      timed_out: result.timedOut ?? false,
      duration_ms: result.durationMs ?? 0
    };
  }

  private commandTimeoutMs(timeoutSec?: number): number {
    if (timeoutSec === undefined) {
      return DEFAULT_TIMEOUT_MS;
    }

    return Math.max(DEFAULT_TIMEOUT_MS, (timeoutSec + 30) * 1000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
