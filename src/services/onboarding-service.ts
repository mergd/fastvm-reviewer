import type { AppContext } from "../app";
import { createEmptyBaseline } from "../onboarding/baseline-state";
import { RepoBootstrapper } from "../onboarding/bootstrap-repo";
import { StackDetector } from "../onboarding/detect-stack";
import { BaselineRefresher } from "../onboarding/refresh-baseline";
import { normalizeReviewProfile } from "../onboarding/review-profile";
import { RepoValidator } from "../onboarding/validate-repo";
import type { RepoRecord, ReviewProfile } from "../types";

export class OnboardingService {
  private readonly stackDetector: StackDetector;
  private readonly bootstrapper: RepoBootstrapper;
  private readonly validator: RepoValidator;
  private readonly refresher: BaselineRefresher;

  constructor(private readonly app: AppContext) {
    this.stackDetector = new StackDetector(app.githubInstallations, app.store, app.setupAnalyzer);
    this.bootstrapper = new RepoBootstrapper(app.sessions, app.githubAuth, app.store);
    this.validator = new RepoValidator(app.sessions, app.store);
    this.refresher = new BaselineRefresher(
      app.store,
      this.bootstrapper,
      this.validator,
    );
  }

  async connectRepository(args: {
    installationId: number;
    owner: string;
    repo: string;
    defaultBranch: string;
    profile?: Partial<ReviewProfile>;
  }): Promise<RepoRecord> {
    const fullName = `${args.owner}/${args.repo}`;
    const existing = this.app.store.getRepo(fullName);
    const detectedProfile = existing
      ? existing.reviewProfile
      : await this.stackDetector.detect({
          repo: {
            owner: args.owner,
            name: args.repo,
            fullName,
            defaultBranch: args.defaultBranch,
            installationId: args.installationId
          },
          onboardingState: "pending",
          baseline: createEmptyBaseline(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

    const record: RepoRecord = {
      repo: {
        owner: args.owner,
        name: args.repo,
        fullName,
        defaultBranch: args.defaultBranch,
        installationId: args.installationId
      },
      onboardingState: existing?.onboardingState ?? "pending",
      reviewProfile: normalizeReviewProfile({
        ...detectedProfile,
        ...args.profile
      }),
      baseline: existing?.baseline ?? createEmptyBaseline(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: existing?.lastError
    };

    return this.app.store.upsertRepo(record);
  }

  async bootstrapRepository(fullName: string): Promise<RepoRecord> {
    const repo = this.requireRepo(fullName);
    const bootstrapped = await this.bootstrapper.bootstrap(repo);
    const validation = await this.validator.validate(bootstrapped);
    return validation.repo;
  }

  async refreshBaselines(): Promise<void> {
    await this.refresher.refreshActiveRepos();
  }

  private requireRepo(fullName: string): RepoRecord {
    const repo = this.app.store.getRepo(fullName);
    if (!repo) {
      throw new Error(`Unknown repository: ${fullName}`);
    }

    return repo;
  }
}
