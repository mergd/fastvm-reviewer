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
    return this.auth.request<Array<{ name: string }>>(
      `/repos/${owner}/${repo}/contents`,
      { method: "GET" },
      installationId
    );
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
    const token = await this.auth.createInstallationToken(installationId);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28"
      }
    });

    if (optional && response.status === 404) {
      return "";
    }

    if (!response.ok) {
      throw new Error(`Failed to read ${path}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json() as {
      content?: string;
      encoding?: string;
    };
    const encoded = payload.content?.replaceAll("\n", "") ?? "";
    return payload.encoding === "base64"
      ? Buffer.from(encoded, "base64").toString("utf8")
      : encoded;
  }
}
