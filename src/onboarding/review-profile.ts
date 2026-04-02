import type { ReviewProfile } from "../types";

export function normalizeReviewProfile(profile: Partial<ReviewProfile>): ReviewProfile {
  return {
    packageManager: profile.packageManager ?? "unknown",
    rootDir: profile.rootDir ?? "/workspace/repo",
    installCommand: profile.installCommand,
    lintCommand: profile.lintCommand,
    typecheckCommand: profile.typecheckCommand,
    testCommand: profile.testCommand,
    appBootCommand: profile.appBootCommand,
    smokeTestCommand: profile.smokeTestCommand,
    envKeys: [...new Set(profile.envKeys ?? [])],
    vmBaseSnapshot: profile.vmBaseSnapshot,
    vmMachine: profile.vmMachine,
    setupSource: profile.setupSource ?? "heuristic",
    instructionsPath: profile.instructionsPath,
    setupNotes: profile.setupNotes
  };
}
