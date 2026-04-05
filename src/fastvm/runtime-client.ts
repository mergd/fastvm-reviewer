import type {
  FastVmCommandResult,
  FastVmMachine,
  FastVmSnapshot
} from "../types";

export interface FastVmClientLike {
  launch(machine?: string, name?: string): Promise<FastVmMachine>;
  restore(snapshot: string, name?: string): Promise<FastVmMachine>;
  run(vmId: string, command: string, timeoutSec?: number): Promise<FastVmCommandResult>;
  snapshot(vmId: string, name: string): Promise<FastVmSnapshot>;
  remove(vmId: string): Promise<void>;
  removeSnapshot(snapshotId: string): Promise<void>;
  listSnapshots(): Promise<FastVmSnapshot[]>;
}
