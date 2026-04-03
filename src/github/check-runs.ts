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
    const octokit = await this.auth.getInstallationOctokit(args.installationId);
    const response = await octokit.rest.checks.create({
      owner: args.owner,
      repo: args.repo,
      name: "FastVM Reviewer",
      head_sha: args.headSha,
      status: args.status,
      conclusion: args.conclusion,
      output: {
        title: args.title,
        summary: args.summary,
        text: args.text
      }
    });

    return {
      id: response.data.id,
      html_url: response.data.html_url ?? undefined,
      status: response.data.status,
      conclusion: response.data.conclusion ?? undefined
    };
  }

  async update(
    installationId: number,
    owner: string,
    repo: string,
    checkRunId: number,
    report: ReviewReport
  ): Promise<GitHubCheckRun> {
    const conclusion = this.toConclusion(report.verdict);
    const octokit = await this.auth.getInstallationOctokit(installationId);
    const response = await octokit.rest.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: "completed",
      conclusion,
      completed_at: new Date().toISOString(),
      output: {
        title: `FastVM Reviewer: ${report.verdict}`,
        summary: report.summary,
        text: this.renderReportText(report)
      }
    });

    return {
      id: response.data.id,
      html_url: response.data.html_url ?? undefined,
      status: response.data.status,
      conclusion: response.data.conclusion ?? undefined
    };
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
