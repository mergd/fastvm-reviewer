import type {
  FastVmCommandResult,
  FastVmMachine,
  FastVmSnapshot
} from "../types";
import type { FastVmClientLike } from "./runtime-client";

const WORKER_UNAVAILABLE_MESSAGE = "FastVM execution is unavailable in the Cloudflare Worker runtime.";

function unavailable(): never {
  throw new Error(WORKER_UNAVAILABLE_MESSAGE);
}

export class UnavailableFastVmClient implements FastVmClientLike {
  async launch(_machine?: string, _name?: string): Promise<FastVmMachine> {
    unavailable();
  }

  async restore(_snapshot: string, _name?: string): Promise<FastVmMachine> {
    unavailable();
  }

  async run(_vmId: string, _command: string, _timeoutSec?: number): Promise<FastVmCommandResult> {
    unavailable();
  }

  async snapshot(_vmId: string, _name: string): Promise<FastVmSnapshot> {
    unavailable();
  }

  async remove(_vmId: string): Promise<void> {
    unavailable();
  }

  async removeSnapshot(_snapshotId: string): Promise<void> {
    unavailable();
  }

  async listSnapshots(): Promise<FastVmSnapshot[]> {
    unavailable();
  }
}
