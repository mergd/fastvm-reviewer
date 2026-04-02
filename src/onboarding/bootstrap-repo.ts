import { SessionManager } from "../fastvm/session-manager";
import { GitHubAppAuth } from "../github/app-auth";
import type { RepoStore } from "../state/repo-store";
import type { RepoRecord } from "../types";
import { markBaselineFailure, markBaselineRebuilding, promoteBaseline } from "./baseline-state";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export class RepoBootstrapper {
  constructor(
    private readonly sessions: SessionManager,
    private readonly auth: GitHubAppAuth,
    private readonly store: RepoStore
  ) {}

  async bootstrap(repo: RepoRecord): Promise<RepoRecord> {
    const started = this.store.upsertRepo({
      ...repo,
      onboardingState: "bootstrapping",
      baseline: markBaselineRebuilding(repo.baseline),
      updatedAt: new Date().toISOString(),
      lastError: undefined
    });
    const session = await this.sessions.startReviewSession(
      repo.repo.fullName,
      repo.reviewProfile?.vmBaseSnapshot
    );

    try {
      const token = await this.auth.createInstallationToken(repo.repo.installationId);
      const remoteUrl = `https://x-access-token:${token}@github.com/${repo.repo.fullName}.git`;
      const repoDir = repo.reviewProfile?.rootDir ?? session.workspacePath;
      const cloneResult = await this.sessions.run(
        session,
        [
          "set -euo pipefail",
          `mkdir -p ${shellEscape(repoDir)}`,
          `if [ ! -d ${shellEscape(`${repoDir}/.git`)} ]; then git clone ${shellEscape(remoteUrl)} ${shellEscape(repoDir)}; fi`,
          `cd ${shellEscape(repoDir)}`,
          `git remote set-url origin ${shellEscape(remoteUrl)}`,
          "git fetch origin --prune",
          `git checkout -f ${shellEscape(repo.repo.defaultBranch)}`,
          `git reset --hard ${shellEscape(`origin/${repo.repo.defaultBranch}`)}`
        ].join(" && "),
        600
      );
      if (cloneResult.exit_code !== 0) {
        throw new Error(cloneResult.stderr || cloneResult.stdout || "Failed to clone default branch during bootstrap");
      }

      if (repo.reviewProfile?.installCommand) {
        const installCommand = `cd ${shellEscape(repo.reviewProfile.rootDir ?? session.workspacePath)} && ${repo.reviewProfile.installCommand}`;
        const installResult = await this.sessions.run(session, installCommand, 1200);
        if (installResult.exit_code !== 0) {
          throw new Error(installResult.stderr || installResult.stdout || "Install failed during bootstrap");
        }
      }

      const headResult = await this.sessions.run(
        session,
        `cd ${shellEscape(repoDir)} && git rev-parse HEAD`,
        60
      );
      if (headResult.exit_code !== 0) {
        throw new Error(headResult.stderr || headResult.stdout || "Failed to resolve default branch SHA");
      }

      const snapshotName = `${repo.repo.fullName.replaceAll("/", "-")}-baseline-${Date.now()}`;
      const snapshotId = await this.sessions.checkpoint(session, snapshotName);
      if (repo.baseline.previousSnapshotId) {
        await this.sessions.removeSnapshot(repo.baseline.previousSnapshotId);
      }

      return this.store.upsertRepo({
        ...started,
        baseline: promoteBaseline(started.baseline, snapshotId, headResult.stdout.trim()),
        onboardingState: "validating",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      return this.store.upsertRepo({
        ...started,
        onboardingState: "error",
        baseline: markBaselineFailure(started.baseline, error instanceof Error ? error.message : String(error)),
        updatedAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error)
      });
    } finally {
      await this.sessions.cleanup(session);
    }
  }
}
