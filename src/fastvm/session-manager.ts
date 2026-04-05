import { randomUUID } from "node:crypto";
import type { FastVmCommandResult, ReviewerSession } from "../types";
import type { FastVmClientLike } from "./runtime-client";

const DEFAULT_BASE_SNAPSHOT = "reviewer-base";

export class SessionManager {
  constructor(
    private readonly fastVm: FastVmClientLike,
    private readonly baseSnapshotName: string = DEFAULT_BASE_SNAPSHOT,
  ) {}

  async startReviewSession(repoFullName: string, baselineSnapshotId?: string): Promise<ReviewerSession> {
    const snapshotId = baselineSnapshotId ?? (await this.resolveBaseSnapshotId());
    const vm = await this.fastVm.restore(snapshotId, this.buildVmName(repoFullName));
    const session: ReviewerSession = {
      id: randomUUID(),
      repoFullName,
      baselineSnapshotId: snapshotId,
      vmId: vm.id,
      workspacePath: "/workspace/repo",
      createdAt: new Date().toISOString()
    };

    await this.fastVm.run(vm.id, "mkdir -p /workspace");
    return session;
  }

  async run(session: ReviewerSession, command: string, timeoutSec?: number): Promise<FastVmCommandResult> {
    return this.fastVm.run(session.vmId, command, timeoutSec);
  }

  async checkpoint(session: ReviewerSession, name: string): Promise<string> {
    const snapshot = await this.fastVm.snapshot(session.vmId, name);
    return snapshot.id;
  }

  async cleanup(session: ReviewerSession): Promise<void> {
    await this.fastVm.remove(session.vmId);
  }

  async removeSnapshot(snapshotId: string): Promise<void> {
    await this.fastVm.removeSnapshot(snapshotId);
  }

  private async resolveBaseSnapshotId(): Promise<string> {
    const snapshots = await this.fastVm.listSnapshots();
    const directMatch = snapshots.find((snapshot) => snapshot.name === this.baseSnapshotName);

    if (directMatch) {
      return directMatch.id;
    }

    const latestSnapshot = [...snapshots]
      .reverse()
      .find((snapshot) => snapshot.name.startsWith(this.baseSnapshotName));

    if (latestSnapshot) {
      return latestSnapshot.id;
    }

    throw new Error(`No FastVM snapshot found for base name: ${this.baseSnapshotName}`);
  }

  private buildVmName(repoFullName: string): string {
    const sanitized = repoFullName.replaceAll("/", "-").replaceAll("_", "-");
    return `${sanitized}-${Date.now()}`;
  }
}
