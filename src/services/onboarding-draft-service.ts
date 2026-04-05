import { defaultReviewProfile } from "../config/review-profiles";
import { GitHubInstallations } from "../github/installations";
import { normalizeReviewProfile } from "../onboarding/review-profile";
import { SetupAnalyzer } from "../onboarding/setup-analysis";
import type { OnboardingDraftResponse } from "../onboarding/types";
import { OnboardingStore } from "../onboarding/d1-store";
import { renderCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import type { RepoRef, ReviewProfile } from "../types";

export class OnboardingDraftService {
  constructor(
    private readonly installations: GitHubInstallations,
    private readonly analyzer?: SetupAnalyzer
  ) {}

  async listInstallationRepositories(installationId: number) {
    return this.installations.listInstallationRepositories(installationId);
  }

  async detectDraft(args: {
    installationId: number;
    owner: string;
    repo: string;
    defaultBranch: string;
    store?: OnboardingStore;
  }): Promise<OnboardingDraftResponse> {
    const rootEntries = await this.installations.listRootEntries(args.installationId, args.owner, args.repo);
    const fallbackProfile = defaultReviewProfile({
      files: rootEntries.map((entry) => entry.name)
    });
    const profileFromRepo = await this.installations.detectReviewProfile(
      args.installationId,
      args.owner,
      args.repo
    );

    let analyzedProfile: Partial<ReviewProfile> = {};
    let draftError: string | undefined;
    if (profileFromRepo.setupSource !== "cloud-agents.md" && this.analyzer?.isConfigured()) {
      try {
        const setupContext = await this.installations.collectSetupDocuments(
          args.installationId,
          args.owner,
          args.repo
        );
        const analysis = await this.analyzer.analyze({
          owner: args.owner,
          repo: args.repo,
          rootFiles: setupContext.rootFiles,
          documents: setupContext.documents
        });
        analyzedProfile = {
          ...analysis.profile,
          setupNotes: [analysis.rationale, ...analysis.missingInformation].filter(Boolean).join("\n")
        };
      } catch (error) {
        draftError = error instanceof Error ? error.message : String(error);
        analyzedProfile = {
          setupNotes: `Setup analysis failed, so onboarding fell back to repo hints. ${draftError}`
        };
      }
    }

    const repoRef: RepoRef = {
      owner: args.owner,
      name: args.repo,
      fullName: `${args.owner}/${args.repo}`,
      defaultBranch: args.defaultBranch,
      installationId: args.installationId
    };
    const detectedProfile = normalizeReviewProfile({
      ...fallbackProfile,
      ...profileFromRepo,
      ...analyzedProfile
    });
    const existing = args.store ? await args.store.getRepository(repoRef.fullName) : undefined;
    const draftProfile = detectedProfile;
    const persisted = args.store
      ? await args.store.saveRepository(repoRef, draftProfile, existing?.approvedProfile, draftError)
      : undefined;

    return {
      repository: persisted ?? existing ?? {
        repo: repoRef,
        draftProfile,
        approvedProfile: undefined,
        secretKeys: [],
        validation: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: draftError
      },
      rootFiles: rootEntries.map((entry) => entry.name)
    };
  }

  renderCloudAgents(profile: ReviewProfile): string {
    return renderCloudAgentsMarkdown(profile);
  }
}
