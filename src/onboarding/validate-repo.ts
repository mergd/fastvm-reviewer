import { SessionManager } from "../fastvm/session-manager";
import type { RepoStore } from "../state/repo-store";
import type { RepoRecord, VerificationStepResult } from "../types";
import { markBaselineFailure } from "./baseline-state";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export class RepoValidator {
  constructor(
    private readonly sessions: SessionManager,
    private readonly store: RepoStore
  ) {}

  async validate(repo: RepoRecord): Promise<{ repo: RepoRecord; steps: VerificationStepResult[] }> {
    if (!repo.baseline.activeSnapshotId) {
      throw new Error(`Repo ${repo.repo.fullName} has no active baseline snapshot to validate`);
    }

    const session = await this.sessions.startReviewSession(repo.repo.fullName, repo.baseline.activeSnapshotId);
    const steps: VerificationStepResult[] = [];
    const repoDir = repo.reviewProfile?.rootDir ?? session.workspacePath;
    const commands = [
      ["install", repo.reviewProfile?.installCommand],
      ["lint", repo.reviewProfile?.lintCommand],
      ["typecheck", repo.reviewProfile?.typecheckCommand],
      ["test", repo.reviewProfile?.testCommand]
    ] as const;
    const hasConfiguredCommands = commands.some(([, command]) => Boolean(command));

    try {
      if (!hasConfiguredCommands) {
        const message = "No setup or validation commands are configured. Add cloud-agents.md or provide setup instructions before bootstrapping.";
        const failedRepo = this.store.upsertRepo({
          ...repo,
          onboardingState: "error",
          baseline: markBaselineFailure(repo.baseline, message),
          updatedAt: new Date().toISOString(),
          lastError: message
        });

        return {
          repo: failedRepo,
          steps: [
            {
              name: "setup",
              status: "failed",
              reason: message
            }
          ]
        };
      }

      for (const [name, command] of commands) {
        if (!command) {
          steps.push({
            name,
            status: "skipped",
            reason: "No command configured"
          });
          continue;
        }

        const result = await this.sessions.run(session, `cd ${shellEscape(repoDir)} && ${command}`, name === "install" ? 600 : 300);
        steps.push({
          name,
          status: result.exit_code === 0 ? "passed" : "failed",
          command,
          reason: result.exit_code === 0 ? undefined : result.stderr || result.stdout,
          logs: {
            command,
            exitCode: result.exit_code,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: result.timed_out,
            durationMs: result.duration_ms
          }
        });

        if (result.exit_code !== 0) {
          const failedRepo = this.store.upsertRepo({
            ...repo,
            onboardingState: "error",
            baseline: markBaselineFailure(repo.baseline, result.stderr || result.stdout || `${name} failed`),
            updatedAt: new Date().toISOString(),
            lastError: result.stderr || result.stdout || `${name} failed`
          });
          return {
            repo: failedRepo,
            steps
          };
        }
      }

      const readyRepo = this.store.upsertRepo({
        ...repo,
        onboardingState: "ready",
        baseline: {
          ...repo.baseline,
          health: "fresh",
          lastValidatedAt: new Date().toISOString()
        },
        updatedAt: new Date().toISOString(),
        lastError: undefined
      });

      return {
        repo: readyRepo,
        steps
      };
    } finally {
      await this.sessions.cleanup(session);
    }
  }
}
