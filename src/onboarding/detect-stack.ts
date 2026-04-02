import type { RepoStore } from "../state/repo-store";
import type { RepoRecord, ReviewProfile } from "../types";
import { defaultReviewProfile } from "../config/review-profiles";
import { GitHubInstallations } from "../github/installations";
import { normalizeReviewProfile } from "./review-profile";
import { SetupAnalyzer } from "./setup-analysis";

export class StackDetector {
  constructor(
    private readonly installations: GitHubInstallations,
    private readonly store: RepoStore,
    private readonly analyzer?: SetupAnalyzer
  ) {}

  async detect(repo: RepoRecord): Promise<ReviewProfile> {
    const profile = await this.installations.detectReviewProfile(
      repo.repo.installationId,
      repo.repo.owner,
      repo.repo.name
    );

    if (profile.setupSource === "cloud-agents.md") {
      return normalizeReviewProfile(profile);
    }

    if (!this.analyzer?.isConfigured()) {
      return normalizeReviewProfile({
        ...defaultReviewProfile({ files: [] }),
        ...profile
      });
    }

    const setupContext = await this.installations.collectSetupDocuments(
      repo.repo.installationId,
      repo.repo.owner,
      repo.repo.name
    );
    let analysis;
    try {
      analysis = await this.analyzer.analyze({
        owner: repo.repo.owner,
        repo: repo.repo.name,
        rootFiles: setupContext.rootFiles,
        documents: setupContext.documents
      });
    } catch (error) {
      return normalizeReviewProfile({
        ...defaultReviewProfile({ files: [] }),
        ...profile,
        setupNotes: `OpenAI setup analysis failed, so onboarding fell back to heuristics. ${error instanceof Error ? error.message : String(error)}`
      });
    }

    return normalizeReviewProfile({
      ...defaultReviewProfile({ files: [] }),
      ...profile,
      ...analysis.profile,
      setupNotes: [analysis.rationale, ...analysis.missingInformation].filter(Boolean).join("\n")
    });
  }
}
