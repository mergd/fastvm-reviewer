import type { RepoRecord, ReviewProfile, SetupDocument } from "../types";
import type { RepoStore } from "../state/repo-store";
import { defaultReviewProfile } from "../config/review-profiles";
import { parseCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import { normalizeReviewProfile } from "../onboarding/review-profile";
import { GitHubAppAuth } from "./app-auth";

interface InstallationRepositoriesEvent {
  installation: { id: number };
  repositories_added?: Array<{
    full_name: string;
    name: string;
    owner: { login: string };
    default_branch: string;
  }>;
}

const SETUP_CANDIDATE_PATHS = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
  "go.mod",
  "Cargo.toml",
  "Cargo.lock",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "Makefile",
  "justfile",
  "Taskfile.yml",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  ".tool-versions",
  "README.md",
  "README.mdx",
  "README",
  ".env.example",
  ".env.sample",
  ".env.local.example",
  "bunfig.toml",
  "turbo.json",
  "pnpm-workspace.yaml",
  "nx.json",
  "next.config.js",
  "next.config.mjs",
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "cloud-agents.md"
] as const;

export class GitHubInstallations {
  constructor(
    private readonly auth: GitHubAppAuth,
    private readonly store: RepoStore
  ) {}

  async handleRepositoriesAdded(event: InstallationRepositoriesEvent): Promise<RepoRecord[]> {
    const records: RepoRecord[] = [];

    for (const repository of event.repositories_added ?? []) {
      const profile = await this.detectReviewProfile(
        event.installation.id,
        repository.owner.login,
        repository.name
      );
      const now = new Date().toISOString();
      const record: RepoRecord = {
        repo: {
          owner: repository.owner.login,
          name: repository.name,
          fullName: repository.full_name,
          defaultBranch: repository.default_branch,
          installationId: event.installation.id
        },
        onboardingState: "pending",
        reviewProfile: profile,
        baseline: {
          health: "stale"
        },
        createdAt: now,
        updatedAt: now
      };
      records.push(this.store.upsertRepo(record));
    }

    return records;
  }

  async detectReviewProfile(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<ReviewProfile> {
    const contents = await this.listRootEntries(installationId, owner, repo);

    const fallbackProfile = defaultReviewProfile({
      files: contents.map((entry) => entry.name)
    });
    const cloudAgentsProfile = await this.fetchCloudAgentsProfile(installationId, owner, repo);

    return normalizeReviewProfile({
      ...fallbackProfile,
      ...cloudAgentsProfile
    });
  }

  async listRootEntries(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<Array<{ name: string }>> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ""
    });

    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data.map((entry) => ({
      name: entry.name
    }));
  }

  async collectSetupDocuments(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<{ rootFiles: string[]; documents: SetupDocument[] }> {
    const entries = await this.listRootEntries(installationId, owner, repo);
    const rootFiles = entries.map((entry) => entry.name);
    const candidatePaths = SETUP_CANDIDATE_PATHS.filter((path) => rootFiles.includes(path));
    const documents = await Promise.all(
      candidatePaths.map(async (path) => ({
        path,
        content: await this.fetchTextFile(installationId, owner, repo, path)
      }))
    );

    return {
      rootFiles,
      documents: documents.filter((document) => document.content.trim().length > 0)
    };
  }

  private async fetchCloudAgentsProfile(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<Partial<ReviewProfile> | undefined> {
    const markdown = await this.fetchTextFile(installationId, owner, repo, "cloud-agents.md", true);
    if (!markdown) {
      return undefined;
    }

    return parseCloudAgentsMarkdown(markdown);
  }

  private async fetchTextFile(
    installationId: number,
    owner: string,
    repo: string,
    path: string,
    optional = false
  ): Promise<string> {
    const octokit = await this.auth.getInstallationOctokit(installationId);

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path
      });

      if (Array.isArray(response.data)) {
        return "";
      }

      if (response.data.type !== "file") {
        return "";
      }

      const encoded = response.data.content.replaceAll("\n", "");
      return response.data.encoding === "base64"
        ? Buffer.from(encoded, "base64").toString("utf8")
        : encoded;
    } catch (error) {
      if (optional && error instanceof Error && "status" in error && error.status === 404) {
        return "";
      }

      throw error;
    }
  }
}
