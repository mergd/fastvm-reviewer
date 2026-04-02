import type { BaselineHealth, BaselineSnapshot } from "../types";

export interface BaselineMetadata extends BaselineSnapshot {
  candidateSnapshotId?: string;
}

export function createEmptyBaseline(health: BaselineHealth = "stale"): BaselineMetadata {
  return {
    health
  };
}

export function promoteBaseline(
  current: BaselineMetadata,
  nextSnapshotId: string,
  commitSha: string
): BaselineMetadata {
  const now = new Date().toISOString();
  return {
    activeSnapshotId: nextSnapshotId,
    previousSnapshotId: current.activeSnapshotId,
    sourceCommitSha: commitSha,
    builtAt: now,
    lastValidatedAt: now,
    health: "fresh"
  };
}

export function markBaselineFailure(current: BaselineMetadata, reason: string): BaselineMetadata {
  return {
    ...current,
    health: "failed",
    stalenessReason: reason
  };
}

export function markBaselineRebuilding(current: BaselineMetadata): BaselineMetadata {
  return {
    ...current,
    health: "rebuilding",
    stalenessReason: undefined
  };
}

export function markBaselineStale(current: BaselineMetadata, reason: string): BaselineMetadata {
  return {
    ...current,
    health: "stale",
    stalenessReason: reason
  };
}
