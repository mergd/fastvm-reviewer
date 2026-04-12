import type { RepoRecord, ReviewProfile, SetupDocument } from "../types";
import type { RepoStore } from "../state/repo-store";
import { defaultReviewProfile } from "../config/review-profiles";
import { parseCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import {
  CLOUD_AGENTS_PATH,
  REVIEWER_WORKFLOW_PATH
} from "../onboarding/reviewer-activation";
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

  async listInstallationRepositories(installationId: number): Promise<Array<{
    fullName: string;
    name: string;
    owner: string;
    defaultBranch: string;
    updatedAt: string | null;
    description: string | null;
    htmlUrl: string;
    isFork: boolean;
  }>> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    const response = await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100
    });

    return response.data.repositories.map((repository) => ({
      fullName: repository.full_name,
      name: repository.name,
      owner: repository.owner.login,
      defaultBranch: repository.default_branch,
      updatedAt: repository.pushed_at ?? repository.updated_at,
      description: repository.description,
      htmlUrl: repository.html_url,
      isFork: repository.fork
    }));
  }

  async listInstallationRepositoriesWithActivation(installationId: number): Promise<Array<{
    fullName: string;
    name: string;
    owner: string;
    defaultBranch: string;
    activation: {
      hasCloudAgents: boolean;
      hasReviewerWorkflow: boolean;
      isActive: boolean;
    };
  }>> {
    const repositories = await this.listInstallationRepositories(installationId);

    return Promise.all(repositories.map(async (repository) => ({
      ...repository,
      activation: await this.getRepositoryActivation(
        installationId,
        repository.owner,
        repository.name
      )
    })));
  }

  async getRepositoryActivation(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<{
    hasCloudAgents: boolean;
    hasReviewerWorkflow: boolean;
    isActive: boolean;
  }> {
    const [cloudAgents, workflow] = await Promise.all([
      this.fetchTextFile(installationId, owner, repo, CLOUD_AGENTS_PATH, true),
      this.fetchTextFile(installationId, owner, repo, REVIEWER_WORKFLOW_PATH, true)
    ]);

    const hasCloudAgents = cloudAgents.trim().length > 0;
    const hasReviewerWorkflow = workflow.trim().length > 0;

    return {
      hasCloudAgents,
      hasReviewerWorkflow,
      isActive: hasCloudAgents && hasReviewerWorkflow
    };
  }

  async listAppInstallations(): Promise<Array<{
    id: number;
    accountLogin: string;
    targetType: string;
  }>> {
    return this.auth.listInstallations();
  }

  async searchRepositoriesWithReviewerWorkflow(
    installationId: number,
    accountLogin: string,
    targetType: string
  ): Promise<Array<{
    fullName: string;
    name: string;
    owner: string;
    defaultBranch: string;
  }>> {
    const octokit = await this.auth.getInstallationOctokit(installationId);
    const scopeQualifier = targetType.toLowerCase() === "organization"
      ? `org:${accountLogin}`
      : `user:${accountLogin}`;
    const response = await octokit.request("GET /search/code", {
      q: `filename:cloud-reviewer.yml path:.github/workflows ${scopeQualifier}`,
      per_page: 100
    });
    const repositories = new Map<string, {
      fullName: string;
      name: string;
      owner: string;
      defaultBranch: string;
    }>();

    for (const item of response.data.items) {
      repositories.set(item.repository.full_name, {
        fullName: item.repository.full_name,
        name: item.repository.name,
        owner: item.repository.owner.login,
        defaultBranch: item.repository.default_branch ?? "main"
      });
    }

    return [...repositories.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
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

  async upsertTextFile(args: {
    installationId: number;
    owner: string;
    repo: string;
    path: string;
    content: string;
    message: string;
  }): Promise<void> {
    const octokit = await this.auth.getInstallationOctokit(args.installationId);
    let sha: string | undefined;

    try {
      const existing = await octokit.rest.repos.getContent({
        owner: args.owner,
        repo: args.repo,
        path: args.path
      });

      if (!Array.isArray(existing.data) && existing.data.type === "file") {
        sha = existing.data.sha;
      }
    } catch (error) {
      if (!(error instanceof Error && "status" in error && error.status === 404)) {
        throw error;
      }
    }

    await octokit.rest.repos.createOrUpdateFileContents({
      owner: args.owner,
      repo: args.repo,
      path: args.path,
      message: args.message,
      content: Buffer.from(args.content, "utf8").toString("base64"),
      sha
    });
  }

  private async fetchCloudAgentsProfile(
    installationId: number,
    owner: string,
    repo: string
  ): Promise<Partial<ReviewProfile> | undefined> {
    const markdown = await this.fetchTextFile(installationId, owner, repo, CLOUD_AGENTS_PATH, true);
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
