import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context } from "hono";
import { createAppContext } from "./app";
import type { AppContext } from "./app";
import {
  decryptGitHubSession,
  encryptGitHubSession,
  type GitHubUserSession
} from "./auth/github-session";
import type { EnvSource } from "./config/env";
import { UnavailableFastVmClient } from "./fastvm/unavailable-client";
import { OnboardingStore } from "./onboarding/d1-store";
import type { OnboardingValidationResult } from "./onboarding/types";
import {
  handleApproveOnboardingDraft,
  handleGetOnboardingDraft,
  handleListOnboardingRepositories,
  handleValidateOnboardingDraft
} from "./routes/onboarding-api";
import type { WorkerEnv } from "./worker-env";

type WorkerAppEnv = {
  Bindings: WorkerEnv;
  Variables: {
    appContext: AppContext;
  };
};

const GITHUB_SESSION_COOKIE = "github-dashboard-session";
const GITHUB_STATE_COOKIE = "github-dashboard-state";

function runnerUrl(env: WorkerEnv, path: string): URL {
  if (!env.RUNNER_BASE_URL) {
    throw new Error("RUNNER_BASE_URL is not configured");
  }

  return new URL(path, env.RUNNER_BASE_URL);
}

async function proxyToRunner(
  request: Request,
  env: WorkerEnv,
  targetPath: string,
  body?: string
): Promise<Response> {
  const headers = new Headers();
  headers.set("x-runner-secret", env.RUNNER_SHARED_SECRET ?? "");

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  for (const name of ["x-github-event", "x-github-delivery", "x-hub-signature-256"]) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  try {
    const response = await fetch(runnerUrl(env, targetPath), {
      method: request.method,
      headers,
      body
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : String(error)
    }, { status: 502 });
  }
}

async function requestRunnerJson<T>(
  env: WorkerEnv,
  targetPath: string,
  body: unknown
): Promise<T> {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-runner-secret", env.RUNNER_SHARED_SECRET ?? "");

  const response = await fetch(runnerUrl(env, targetPath), {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const payload = await response.json() as { error?: string } & T;
  if (!response.ok) {
    throw new Error(payload.error ?? `Runner request failed with ${response.status}`);
  }

  return payload;
}

function splitRepoFullName(value: string): { owner: string; repo: string } {
  const [owner, repo] = value.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo name: ${value}`);
  }

  return { owner, repo };
}

function oauthConfigured(env: WorkerEnv): boolean {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.ONBOARDING_ENCRYPTION_KEY);
}

function encryptionSecret(env: WorkerEnv): string {
  if (!env.ONBOARDING_ENCRYPTION_KEY) {
    throw new Error("ONBOARDING_ENCRYPTION_KEY is not configured");
  }

  return env.ONBOARDING_ENCRYPTION_KEY;
}

function githubRedirectUri(requestUrl: string): string {
  return new URL("/auth/github/callback", requestUrl).toString();
}

async function loadGitHubSession(c: Context<WorkerAppEnv>): Promise<GitHubUserSession | undefined> {
  return decryptGitHubSession(getCookie(c, GITHUB_SESSION_COOKIE), encryptionSecret(c.env));
}

async function fetchGitHubViewer(accessToken: string): Promise<GitHubUserSession> {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/vnd.github+json",
    "user-agent": "fastvm-pr-reviewer"
  };
  const [userResponse, orgsResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/orgs", { headers })
  ]);

  if (!userResponse.ok) {
    throw new Error(`GitHub user lookup failed with ${userResponse.status}`);
  }
  if (!orgsResponse.ok) {
    throw new Error(`GitHub org lookup failed with ${orgsResponse.status}`);
  }

  const user = await userResponse.json() as { login: string; avatar_url?: string };
  const orgs = await orgsResponse.json() as Array<{ login: string }>;

  return {
    accessToken,
    login: user.login,
    avatarUrl: user.avatar_url,
    organizations: orgs.map((org) => org.login)
  };
}

async function exchangeGitHubCode(env: WorkerEnv, code: string, redirectUri: string): Promise<string> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });
  const payload = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? `GitHub OAuth exchange failed with ${response.status}`);
  }

  return payload.access_token;
}

function parseSortableTimestamp(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function getLatestTimestamp(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    const time = parseSortableTimestamp(value);
    if (time > latestTime) {
      latest = value ?? null;
      latestTime = time;
    }
  }

  return latest;
}

async function listDashboardPendingRepos(
  appContext: AppContext,
  env: WorkerEnv,
  session: GitHubUserSession,
  requestUrl: string
): Promise<Array<{
  fullName: string;
  installationId: number;
  setupUrl: string;
  hasReviewerWorkflow: boolean;
  hasCloudAgents: boolean;
  hasApprovedProfile: boolean;
  lastTouchedAt: string | null;
  description: string | null;
  htmlUrl: string;
  isFork: boolean;
}>> {
  const visibleAccounts = new Set([session.login, ...session.organizations]);
  const installations = await appContext.githubInstallations.listAppInstallations();
  const store = env.DB ? new OnboardingStore(env.DB) : undefined;
  const baseUrl = new URL(requestUrl);

  const pendingGroups = await Promise.all(
    installations
      .filter((installation) => installation.accountLogin && visibleAccounts.has(installation.accountLogin))
      .map(async (installation) => {
        const [allRepositories, workflowRepositories, storedRecords] = await Promise.all([
          appContext.githubInstallations.listInstallationRepositories(installation.id),
          appContext.githubInstallations.searchRepositoriesWithReviewerWorkflow(
            installation.id,
            installation.accountLogin,
            installation.targetType
          ),
          store?.listRepositoriesForInstallation(installation.id) ?? Promise.resolve([])
        ]);

        const workflowRepoNames = new Set(workflowRepositories.map((r) => r.fullName));
        const allRepositoriesByName = new Map(allRepositories.map((repository) => [
          repository.fullName,
          repository
        ]));
        const storedByName = new Map(storedRecords.map((record) => [record.repo.fullName, record]));

        const makeSetupUrl = (fullName: string) =>
          new URL(
            `/setup/github?installation_id=${installation.id}&repo=${encodeURIComponent(fullName)}`,
            `${baseUrl.protocol}//${baseUrl.host}`
          ).toString();

        const repositoriesWithActivation = await Promise.all(
          workflowRepositories.map(async (repository) => ({
            repository,
            activation: await appContext.githubInstallations.getRepositoryActivation(
              installation.id,
              repository.owner,
              repository.name
            )
          }))
        );

        const partialRepos = repositoriesWithActivation
          .filter(({ repository, activation }) => {
            const stored = storedByName.get(repository.fullName);
            return !activation.hasCloudAgents || !stored?.approvedProfile;
          })
          .map(({ repository, activation }) => {
            const stored = storedByName.get(repository.fullName);
            const repositoryMeta = allRepositoriesByName.get(repository.fullName);

            return {
              fullName: repository.fullName,
              installationId: installation.id,
              setupUrl: makeSetupUrl(repository.fullName),
              hasReviewerWorkflow: true,
              hasCloudAgents: activation.hasCloudAgents,
              hasApprovedProfile: Boolean(stored?.approvedProfile),
              lastTouchedAt: getLatestTimestamp(stored?.updatedAt, repositoryMeta?.updatedAt),
              description: repositoryMeta?.description ?? null,
              htmlUrl: repositoryMeta?.htmlUrl ?? `https://github.com/${repository.fullName}`,
              isFork: repositoryMeta?.isFork ?? false
            };
          });

        const notStartedRepos = allRepositories
          .filter((repository) => !workflowRepoNames.has(repository.fullName))
          .map((repository) => ({
            fullName: repository.fullName,
            installationId: installation.id,
            setupUrl: makeSetupUrl(repository.fullName),
            hasReviewerWorkflow: false,
            hasCloudAgents: false,
            hasApprovedProfile: false,
            lastTouchedAt: repository.updatedAt,
            description: repository.description,
            htmlUrl: repository.htmlUrl,
            isFork: repository.isFork
          }));

        return [...partialRepos, ...notStartedRepos];
      })
  );

  return pendingGroups.flat().sort((left, right) =>
    parseSortableTimestamp(right.lastTouchedAt) - parseSortableTimestamp(left.lastTouchedAt) ||
    left.fullName.localeCompare(right.fullName)
  );
}

function serveAppShell(c: Context<WorkerAppEnv>): Promise<Response> {
  return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url).toString()));
}

export default {
  fetch: (() => {
    const app = new Hono<WorkerAppEnv>();

    app.use("*", async (c, next) => {
      c.set("appContext", createAppContext(c.env as EnvSource, new UnavailableFastVmClient()));
      await next();
    });

    app.onError((error, c) => {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
    });

    app.get("/", (c) => c.redirect("/dashboard"));

    app.get("/health", (c) => {
      return c.json({ ok: true });
    });

    app.get("/dashboard", (c) => serveAppShell(c));

    app.get("/api/dashboard", async (c) => {
      const session = oauthConfigured(c.env) ? await loadGitHubSession(c) : undefined;
      const pendingRepos = session
        ? await listDashboardPendingRepos(c.get("appContext"), c.env, session, c.req.url)
        : [];

      return c.json({
        loggedIn: Boolean(session),
        login: session?.login,
        avatarUrl: session?.avatarUrl,
        pendingRepos,
      });
    });

    app.get("/api/setup/config", (c) => c.json({ ok: true }));

    app.get("/api/setup/session", async (c) => {
      if (!oauthConfigured(c.env)) {
        return c.json({ loggedIn: false });
      }

      const session = await loadGitHubSession(c);
      if (!session) {
        return c.json({ loggedIn: false, reason: "not_authenticated" });
      }

      const appContext = c.get("appContext");
      const visibleAccounts = new Set([session.login, ...session.organizations]);
      const installations = await appContext.githubInstallations.listAppInstallations();
      const visible = installations.filter(
        (i) => i.accountLogin && visibleAccounts.has(i.accountLogin)
      );

      const installationsWithRepos = await Promise.all(
        visible.map(async (installation) => ({
          id: installation.id,
          account: installation.accountLogin,
          repositories: await appContext.githubInstallations.listInstallationRepositories(installation.id)
        }))
      );

      return c.json({
        loggedIn: true,
        login: session.login,
        avatarUrl: session.avatarUrl,
        config: {
          runnerConfigured: Boolean(c.env.RUNNER_BASE_URL),
          storageConfigured: Boolean(c.env.DB),
          encryptionConfigured: Boolean(c.env.ONBOARDING_ENCRYPTION_KEY),
        },
        installations: installationsWithRepos,
      });
    });

    app.get("/auth/github/login", async (c) => {
      if (!oauthConfigured(c.env)) {
        return c.redirect("/dashboard");
      }

      const state = crypto.randomUUID();
      setCookie(c, GITHUB_STATE_COOKIE, state, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 600
      });

      const url = new URL("https://github.com/login/oauth/authorize");
      url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID!);
      url.searchParams.set("redirect_uri", githubRedirectUri(c.req.url));
      url.searchParams.set("scope", "read:user read:org");
      url.searchParams.set("state", state);

      return c.redirect(url.toString());
    });

    app.get("/auth/github/callback", async (c) => {
      if (!oauthConfigured(c.env)) {
        return c.redirect("/dashboard");
      }

      const state = c.req.query("state");
      const code = c.req.query("code");
      const cookieState = getCookie(c, GITHUB_STATE_COOKIE);
      if (!state || !code || state !== cookieState) {
        return c.json({ error: "Invalid GitHub OAuth state" }, 400);
      }

      deleteCookie(c, GITHUB_STATE_COOKIE, { path: "/" });
      const accessToken = await exchangeGitHubCode(c.env, code, githubRedirectUri(c.req.url));
      const session = await fetchGitHubViewer(accessToken);
      const encryptedSession = await encryptGitHubSession(session, encryptionSecret(c.env));
      setCookie(c, GITHUB_SESSION_COOKIE, encryptedSession, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 8
      });

      return c.redirect("/dashboard");
    });

    app.get("/auth/github/logout", (c) => {
      deleteCookie(c, GITHUB_SESSION_COOKIE, { path: "/" });
      deleteCookie(c, GITHUB_STATE_COOKIE, { path: "/" });
      return c.redirect("/dashboard");
    });

    app.get("/setup/github", (c) => serveAppShell(c));

    app.get("/api/setup/github/repositories", async (c) => {
      const installationId = Number(c.req.query("installation_id"));
      if (!installationId) {
        return c.json({ error: "installation_id is required" }, 400);
      }

      return handleListOnboardingRepositories(c.get("appContext"), c.env, installationId);
    });

    app.get("/api/setup/github/draft", async (c) => {
      const installationId = Number(c.req.query("installation_id"));
      const repoFullName = c.req.query("repo");
      if (!installationId || !repoFullName) {
        return c.json({ error: "installation_id and repo are required" }, 400);
      }

      return handleGetOnboardingDraft(c.get("appContext"), c.env, {
        installationId,
        repoFullName
      });
    });

    app.post("/api/setup/github/validate", async (c) => {
      return handleValidateOnboardingDraft(
        c.get("appContext"),
        c.env,
        await c.req.json(),
        (payload) => requestRunnerJson<OnboardingValidationResult>(c.env, "/internal/onboarding/validate", payload)
      );
    });

    app.post("/api/setup/github/validate-stream", async (c) => {
      return proxyToRunner(c.req.raw, c.env, "/internal/onboarding/validate-stream", await c.req.text());
    });

    app.post("/api/setup/github/exec", async (c) => {
      return proxyToRunner(c.req.raw, c.env, "/internal/onboarding/exec", await c.req.text());
    });

    app.post("/api/setup/github/chat", async (c) => {
      return proxyToRunner(c.req.raw, c.env, "/internal/onboarding/chat", await c.req.text());
    });

    app.post("/api/setup/github/approve", async (c) => {
      const payload = await c.req.json() as {
        installationId: number;
        repoFullName: string;
        profile: Parameters<typeof handleApproveOnboardingDraft>[2]["profile"];
      };

      return handleApproveOnboardingDraft(c.get("appContext"), c.env, payload, async (approval) => {
        const { owner, repo } = splitRepoFullName(approval.repoFullName);
        const repositories = await c.get("appContext").githubInstallations.listInstallationRepositories(approval.installationId);
        const repository = repositories.find((item) => item.fullName === approval.repoFullName);
        if (!repository) {
          throw new Error("Repository not found for installation");
        }

        await requestRunnerJson(c.env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/connect`, {
          installationId: approval.installationId,
          defaultBranch: repository.defaultBranch,
          profile: approval.profile
        });
        await requestRunnerJson(c.env, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/bootstrap`, {});
      });
    });

    app.post("/webhooks/github", async (c) => {
      const rawBody = await c.req.text();
      const signature = c.req.header("x-hub-signature-256") ?? null;

      if (!await c.get("appContext").githubAuth.verifyWebhookSignature(rawBody, signature)) {
        return c.json({ error: "Invalid webhook signature" }, 401);
      }

      return proxyToRunner(c.req.raw, c.env, "/internal/github/webhooks", rawBody);
    });

    app.post("/repos/:owner/:repo/:action{bootstrap|connect}", async (c) => {
      return proxyToRunner(c.req.raw, c.env, new URL(c.req.url).pathname, await c.req.text());
    });

    app.post("/internal/baselines/refresh", async (c) => {
      return proxyToRunner(c.req.raw, c.env, "/internal/baselines/refresh", await c.req.text());
    });

    app.notFound((c) => c.text("Not found", 404));

    return app.fetch;
  })(),
  async scheduled(): Promise<void> {
    console.warn("Skipping baseline refresh in Cloudflare Worker runtime because FastVM is unavailable.");
  }
};
