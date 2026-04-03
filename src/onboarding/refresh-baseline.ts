import { RepoBootstrapper } from "./bootstrap-repo";
import { RepoValidator } from "./validate-repo";
import { markBaselineFailure, markBaselineStale } from "./baseline-state";
import type { RepoStore } from "../state/repo-store";

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_REFRESH_HOURS = 24;

export class BaselineRefresher {
  constructor(
    private readonly store: RepoStore,
    private readonly bootstrapper: RepoBootstrapper,
    private readonly validator: RepoValidator,
    private readonly refreshHours: number = DEFAULT_REFRESH_HOURS,
  ) {}

  async refreshActiveRepos(): Promise<void> {
    const now = Date.now();
    const repos = this.store.listRepos().filter((repo) => this.shouldRefresh(repo, now));

    for (const repo of repos) {
      const queuedJob = {
        repoFullName: repo.repo.fullName,
        startedAt: new Date().toISOString(),
        status: "running" as const
      };
      this.store.saveBaselineRefresh(queuedJob);

      try {
        const bootstrapped = await this.bootstrapper.bootstrap({
          ...repo,
          baseline: markBaselineStale(repo.baseline, "Scheduled baseline rebuild in progress")
        });
        await this.validator.validate(bootstrapped);
        this.store.saveBaselineRefresh({
          ...queuedJob,
          status: "completed",
          completedAt: new Date().toISOString()
        });
      } catch (error) {
        this.store.upsertRepo({
          ...repo,
          baseline: markBaselineFailure(repo.baseline, error instanceof Error ? error.message : String(error)),
          updatedAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : String(error)
        });
        this.store.saveBaselineRefresh({
          ...queuedJob,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private shouldRefresh(
    repo: ReturnType<RepoStore["listRepos"]>[number],
    now: number
  ): boolean {
    if (repo.onboardingState !== "ready") {
      return false;
    }

    if (!repo.baseline.builtAt) {
      return true;
    }

    const builtAt = new Date(repo.baseline.builtAt).getTime();
    return Number.isNaN(builtAt) || now - builtAt >= this.refreshHours * ONE_HOUR_MS;
  }
}
