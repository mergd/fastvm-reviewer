import type { PullRequestContext, ReviewReport } from "../types";
import { GitHubAppAuth } from "./app-auth";

export class GitHubReviewComments {
  constructor(private readonly auth: GitHubAppAuth) {}

  async publishSummary(context: PullRequestContext, report: ReviewReport): Promise<void> {
    const comments = report.findings
      .filter((finding) => finding.filePath && finding.line)
      .slice(0, 10)
      .map((finding) => ({
        path: finding.filePath,
        line: finding.line,
        body: `**${finding.title}**\n\n${finding.summary}${finding.suggestion ? `\n\nSuggestion: ${finding.suggestion}` : ""}`
      }));

    await this.auth.request(
      `/repos/${context.owner}/${context.repo}/pulls/${context.prNumber}/reviews`,
      {
        method: "POST",
        body: JSON.stringify({
          event: report.verdict === "pass" ? "COMMENT" : "REQUEST_CHANGES",
          body: this.buildReviewBody(report),
          commit_id: context.headSha,
          comments
        })
      },
      context.installationId
    );
  }

  private buildReviewBody(report: ReviewReport): string {
    const findings = report.findings.map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    const steps = report.verificationSteps.map((step) => `- ${step.name}: ${step.status}`);
    return [
      `FastVM Reviewer verdict: **${report.verdict}**`,
      "",
      report.summary,
      "",
      "Verification steps:",
      ...steps,
      "",
      "Findings:",
      ...(findings.length > 0 ? findings : ["- none"])
    ].join("\n");
  }
}
