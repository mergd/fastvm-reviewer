import { createHash } from "node:crypto";
import { SessionManager } from "../fastvm/session-manager";
import type {
  CommandLog,
  PreparedRepo,
  ReviewFinding,
  ReviewProfile,
  ReviewerSession
} from "../types";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function findingId(source: string): string {
  return createHash("sha1").update(source).digest("hex").slice(0, 12);
}

export class CodeInspectionRunner {
  constructor(private readonly sessions: SessionManager) {}

  async inspect(
    session: ReviewerSession,
    preparedRepo: PreparedRepo,
    profile: ReviewProfile
  ): Promise<{ findings: ReviewFinding[]; logs: CommandLog[] }> {
    const findings: ReviewFinding[] = [];
    const logs: CommandLog[] = [];
    const repoDir = profile.rootDir || preparedRepo.workspacePath;

    const diffCheck = await this.sessions.run(
      session,
      `cd ${shellEscape(repoDir)} && git diff --check ${shellEscape(`${preparedRepo.baseSha}...${preparedRepo.headSha}`)}`,
      120
    );
    logs.push(this.toCommandLog("git diff --check", diffCheck));
    if (diffCheck.exit_code !== 0) {
      findings.push({
        id: findingId(diffCheck.stdout + diffCheck.stderr),
        title: "Diff hygiene issues detected",
        summary: diffCheck.stdout || diffCheck.stderr,
        severity: "warning",
        category: "code_quality",
        source: "command"
      });
    }

    const grepCheck = await this.sessions.run(
      session,
      `cd ${shellEscape(repoDir)} && (rg -n "console\\.log|debugger|TODO|FIXME" ${preparedRepo.changedFiles
        .map((file) => shellEscape(file))
        .join(" ")} || true)`,
      120
    );
    logs.push(this.toCommandLog("rg console/debugger/TODO/FIXME", grepCheck));
    if (grepCheck.stdout.trim()) {
      findings.push({
        id: findingId(grepCheck.stdout),
        title: "Potential cleanup leftovers in changed files",
        summary: grepCheck.stdout.trim(),
        severity: "info",
        category: "code_quality",
        source: "heuristic",
        suggestion: "Review whether debug statements or TODO markers should stay in the PR."
      });
    }

    if (preparedRepo.changedFiles.length > 20) {
      findings.push({
        id: findingId(preparedRepo.changedFiles.join(",")),
        title: "Large change surface",
        summary: `The PR touches ${preparedRepo.changedFiles.length} files, which may reduce review confidence.`,
        severity: "info",
        category: "code_quality",
        source: "system"
      });
    }

    return {
      findings,
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
