import type { PullRequestContext, PullRequestFile } from "../types";
import type { RepoStore } from "../state/repo-store";
import { GitHubAppAuth } from "./app-auth";

interface PullRequestPayload {
  installation: { id: number };
  repository: {
    owner: { login: string };
    name: string;
    clone_url: string;
    default_branch: string;
  };
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    head: {
      sha: string;
      ref: string;
    };
    base: {
      sha: string;
      ref: string;
    };
  };
}

interface GitHubPullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export class GitHubPullRequests {
  constructor(
    private readonly auth: GitHubAppAuth,
    private readonly store: RepoStore
  ) {}

  async fromWebhook(payload: PullRequestPayload): Promise<PullRequestContext> {
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const installationId = payload.installation.id;
    const prNumber = payload.pull_request.number;
    const files = await this.auth.request<GitHubPullRequestFile[]>(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files`,
      { method: "GET" },
      installationId
    );

    const context: PullRequestContext = {
      owner,
      repo,
      installationId,
      prNumber,
      title: payload.pull_request.title,
      htmlUrl: payload.pull_request.html_url,
      headSha: payload.pull_request.head.sha,
      baseSha: payload.pull_request.base.sha,
      headRef: payload.pull_request.head.ref,
      baseRef: payload.pull_request.base.ref,
      defaultBranch: payload.repository.default_branch,
      cloneUrl: payload.repository.clone_url,
      changedFiles: files.map(this.mapFile)
    };

    this.store.savePullRequestContext(context);
    return context;
  }

  static key(owner: string, repo: string, prNumber: number): string {
    return `${owner}/${repo}#${prNumber}`;
  }

  private mapFile(file: GitHubPullRequestFile): PullRequestFile {
    return {
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch
    };
  }
}
