import type { GitHubCheckRun, ReviewReport } from "../types";
import { GitHubAppAuth } from "./app-auth";

interface CreateCheckRunArgs {
  installationId: number;
  owner: string;
  repo: string;
  headSha: string;
  status: "queued" | "in_progress" | "completed";
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required";
  title: string;
  summary: string;
  text?: string;
}

export class GitHubCheckRuns {
  constructor(private readonly auth: GitHubAppAuth) {}

  async create(args: CreateCheckRunArgs): Promise<GitHubCheckRun> {
    return this.auth.request<GitHubCheckRun>(
      `/repos/${args.owner}/${args.repo}/check-runs`,
      {
        method: "POST",
        body: JSON.stringify({
          name: "FastVM Reviewer",
          head_sha: args.headSha,
          status: args.status,
          conclusion: args.conclusion,
          output: {
            title: args.title,
            summary: args.summary,
            text: args.text
          }
        })
      },
      args.installationId
    );
  }

  async update(
    installationId: number,
    owner: string,
    repo: string,
    checkRunId: number,
    report: ReviewReport
  ): Promise<GitHubCheckRun> {
    const conclusion = this.toConclusion(report.verdict);
    return this.auth.request<GitHubCheckRun>(
      `/repos/${owner}/${repo}/check-runs/${checkRunId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "completed",
          conclusion,
          completed_at: new Date().toISOString(),
          output: {
            title: `FastVM Reviewer: ${report.verdict}`,
            summary: report.summary,
            text: this.renderReportText(report)
          }
        })
      },
      installationId
    );
  }

  private renderReportText(report: ReviewReport): string {
    const findingLines = report.findings.map((finding) => `- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    const stepLines = report.verificationSteps.map((step) => `- ${step.name}: ${step.status}`);
    return [
      "Verification steps:",
      ...stepLines,
      "",
      "Findings:",
      ...(findingLines.length > 0 ? findingLines : ["- none"])
    ].join("\n");
  }

  private toConclusion(verdict: ReviewReport["verdict"]): CreateCheckRunArgs["conclusion"] {
    switch (verdict) {
      case "pass":
        return "success";
      case "warn":
        return "neutral";
      case "fail":
        return "failure";
      case "error":
        return "action_required";
      default: {
        const exhaustiveCheck: never = verdict;
        return exhaustiveCheck;
      }
    }
  }
}
