import type { PullRequestContext, PreparedRepo, ReviewerSession } from "../types";
import { SessionManager } from "../fastvm/session-manager";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export class RepoPreparer {
  constructor(private readonly sessions: SessionManager) {}

  async prepare(
    session: ReviewerSession,
    context: PullRequestContext,
    installationToken: string
  ): Promise<PreparedRepo> {
    const remoteUrl = `https://x-access-token:${installationToken}@github.com/${context.owner}/${context.repo}.git`;
    const repoDir = session.workspacePath;
    const setupScript = [
      "set -euo pipefail",
      `mkdir -p ${shellEscape(repoDir)}`,
      `if [ ! -d ${shellEscape(`${repoDir}/.git`)} ]; then git clone ${shellEscape(remoteUrl)} ${shellEscape(repoDir)}; fi`,
      `cd ${shellEscape(repoDir)}`,
      `git remote set-url origin ${shellEscape(remoteUrl)}`,
      "git fetch origin --prune",
      `git fetch origin ${shellEscape(`refs/heads/${context.baseRef}:refs/remotes/origin/${context.baseRef}`)}`,
      `git fetch origin ${shellEscape(`pull/${context.prNumber}/head:refs/heads/review-pr-${context.prNumber}`)}`,
      `git checkout -f ${shellEscape(`review-pr-${context.prNumber}`)}`,
      `git reset --hard ${shellEscape(context.headSha)}`
    ].join(" && ");

    const setupResult = await this.sessions.run(session, setupScript, 240);
    if (setupResult.exit_code !== 0) {
      throw new Error(`Failed to prepare repo: ${setupResult.stderr || setupResult.stdout}`);
    }

    const diffSummary = await this.sessions.run(
      session,
      `cd ${shellEscape(repoDir)} && git diff --stat ${shellEscape(`origin/${context.baseRef}...${context.headSha}`)}`,
      120
    );
    const diffPatch = await this.sessions.run(
      session,
      `cd ${shellEscape(repoDir)} && git diff --unified=0 ${shellEscape(`origin/${context.baseRef}...${context.headSha}`)}`,
      120
    );
    const changedFiles = await this.sessions.run(
      session,
      `cd ${shellEscape(repoDir)} && git diff --name-only ${shellEscape(`origin/${context.baseRef}...${context.headSha}`)}`,
      120
    );

    return {
      workspacePath: repoDir,
      diffSummary: diffSummary.stdout.trim(),
      diffPatch: diffPatch.stdout,
      changedFiles: changedFiles.stdout.split("\n").map((value) => value.trim()).filter(Boolean),
      headSha: context.headSha,
      baseSha: context.baseSha
    };
  }
}
