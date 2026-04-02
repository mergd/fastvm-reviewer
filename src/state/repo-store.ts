import type {
  BaselineRefreshJob,
  PullRequestContext,
  RepoRecord,
  ReviewJob
} from "../types";

export interface RepoStore {
  upsertRepo(record: RepoRecord): RepoRecord;
  getRepo(fullName: string): RepoRecord | undefined;
  listRepos(): RepoRecord[];
  saveReviewJob(job: ReviewJob): ReviewJob;
  getReviewJob(id: string): ReviewJob | undefined;
  listReviewJobs(): ReviewJob[];
  savePullRequestContext(context: PullRequestContext): void;
  getPullRequestContext(key: string): PullRequestContext | undefined;
  saveBaselineRefresh(job: BaselineRefreshJob): void;
  listBaselineRefreshJobs(): BaselineRefreshJob[];
}

export class InMemoryRepoStore implements RepoStore {
  private readonly repos = new Map<string, RepoRecord>();
  private readonly reviewJobs = new Map<string, ReviewJob>();
  private readonly pullRequests = new Map<string, PullRequestContext>();
  private readonly baselineRefreshJobs = new Map<string, BaselineRefreshJob>();

  upsertRepo(record: RepoRecord): RepoRecord {
    this.repos.set(record.repo.fullName, record);
    return record;
  }

  getRepo(fullName: string): RepoRecord | undefined {
    return this.repos.get(fullName);
  }

  listRepos(): RepoRecord[] {
    return [...this.repos.values()];
  }

  saveReviewJob(job: ReviewJob): ReviewJob {
    this.reviewJobs.set(job.id, job);
    return job;
  }

  getReviewJob(id: string): ReviewJob | undefined {
    return this.reviewJobs.get(id);
  }

  listReviewJobs(): ReviewJob[] {
    return [...this.reviewJobs.values()];
  }

  savePullRequestContext(context: PullRequestContext): void {
    this.pullRequests.set(this.pullRequestKey(context.owner, context.repo, context.prNumber), context);
  }

  getPullRequestContext(key: string): PullRequestContext | undefined {
    return this.pullRequests.get(key);
  }

  saveBaselineRefresh(job: BaselineRefreshJob): void {
    this.baselineRefreshJobs.set(job.repoFullName, job);
  }

  listBaselineRefreshJobs(): BaselineRefreshJob[] {
    return [...this.baselineRefreshJobs.values()];
  }

  static pullRequestKey(owner: string, repo: string, prNumber: number): string {
    return `${owner}/${repo}#${prNumber}`;
  }

  private pullRequestKey(owner: string, repo: string, prNumber: number): string {
    return InMemoryRepoStore.pullRequestKey(owner, repo, prNumber);
  }
}
