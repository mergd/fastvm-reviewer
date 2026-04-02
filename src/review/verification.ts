import { SessionManager } from "../fastvm/session-manager";
import type {
  CommandLog,
  PreparedRepo,
  ReviewProfile,
  ReviewerSession,
  VerificationStepResult
} from "../types";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

interface VerificationStep {
  name: string;
  command?: string;
}

export class VerificationRunner {
  constructor(private readonly sessions: SessionManager) {}

  async verify(
    session: ReviewerSession,
    preparedRepo: PreparedRepo,
    profile: ReviewProfile
  ): Promise<{ steps: VerificationStepResult[]; logs: CommandLog[] }> {
    const stepsToRun: VerificationStep[] = [
      { name: "install", command: profile.installCommand },
      { name: "lint", command: profile.lintCommand },
      { name: "typecheck", command: profile.typecheckCommand },
      { name: "test", command: profile.testCommand },
      { name: "smoke", command: profile.smokeTestCommand }
    ];
    const results: VerificationStepResult[] = [];
    const logs: CommandLog[] = [];
    const repoDir = profile.rootDir || preparedRepo.workspacePath;

    for (const step of stepsToRun) {
      if (!step.command) {
        results.push({
          name: step.name,
          status: "skipped",
          reason: "No command configured"
        });
        continue;
      }

      const command = `cd ${shellEscape(repoDir)} && ${step.command}`;
      const result = await this.sessions.run(session, command, step.name === "install" ? 600 : 300);
      const log = this.toCommandLog(step.command, result);
      logs.push(log);
      results.push({
        name: step.name,
        status: result.exit_code === 0 ? "passed" : "failed",
        command: step.command,
        logs: log,
        reason: result.exit_code === 0 ? undefined : result.stderr || result.stdout
      });

      if (result.exit_code !== 0) {
        break;
      }
    }

    return {
      steps: results,
      logs
    };
  }

  private toCommandLog(command: string, result: Awaited<ReturnType<SessionManager["run"]>>): CommandLog {
    return {
      command,
      exitCode: result.exit_code,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timed_out,
      durationMs: result.duration_ms
    };
  }
}
