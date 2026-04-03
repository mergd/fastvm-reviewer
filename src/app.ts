import { loadEnv, type EnvConfig, type EnvSource } from "./config/env";
import { FastVmClient } from "./fastvm/client";
import { SessionManager } from "./fastvm/session-manager";
import { GitHubAppAuth } from "./github/app-auth";
import { GitHubCheckRuns } from "./github/check-runs";
import { GitHubInstallations } from "./github/installations";
import { GitHubPullRequests } from "./github/pr-context";
import { GitHubReviewComments } from "./github/review-comments";
import { SetupAnalyzer } from "./onboarding/setup-analysis";
import { InMemoryRepoStore } from "./state/repo-store";

export interface AppContext {
  env: EnvConfig;
  store: InMemoryRepoStore;
  fastVm: FastVmClient;
  sessions: SessionManager;
  githubAuth: GitHubAppAuth;
  githubInstallations: GitHubInstallations;
  githubPullRequests: GitHubPullRequests;
  githubCheckRuns: GitHubCheckRuns;
  githubReviewComments: GitHubReviewComments;
  setupAnalyzer: SetupAnalyzer;
}

export function createAppContext(source?: EnvSource): AppContext {
  const env = loadEnv(source);
  const store = new InMemoryRepoStore();
  const githubAuth = new GitHubAppAuth(env);
  const githubInstallations = new GitHubInstallations(githubAuth, store);
  const githubPullRequests = new GitHubPullRequests(githubAuth, store);
  const githubCheckRuns = new GitHubCheckRuns(githubAuth);
  const githubReviewComments = new GitHubReviewComments(githubAuth);
  const setupAnalyzer = new SetupAnalyzer(env.openAiApiKey);
  const fastVm = new FastVmClient(env.fastVmApiKey);
  const sessions = new SessionManager(fastVm);

  return {
    env,
    store,
    fastVm,
    sessions,
    githubAuth,
    githubInstallations,
    githubPullRequests,
    githubCheckRuns,
    githubReviewComments,
    setupAnalyzer,
  };
}
