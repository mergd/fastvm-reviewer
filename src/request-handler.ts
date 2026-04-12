import type { ReviewProfile } from "./types";
import type { AppContext } from "./app";
import { json, text } from "./http";
import type { OnboardingValidationRequest } from "./onboarding/types";
import { handleGitHubWebhook } from "./routes/github-webhooks";
import { hasRunnerAccess } from "./security/runner-auth";
import { OnboardingService } from "./services/onboarding-service";
import { OnboardingValidationService } from "./services/onboarding-validation-service";
import { SetupChatService } from "./services/setup-chat-service";
import type { SetupSessionStore } from "./services/setup-session-store";

function routeKey(method: string, pathname: string): string {
  return `${method.toUpperCase()} ${pathname}`;
}

function parseRepoPath(pathname: string): { owner: string; repo: string; action: string } | undefined {
  const match = pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/(bootstrap|connect)$/);
  if (!match) {
    return undefined;
  }

  return {
    owner: decodeURIComponent(match[1]),
    repo: decodeURIComponent(match[2]),
    action: match[3]
  };
}

export function createRequestHandler(app: AppContext, sessionStore?: SetupSessionStore): (request: Request) => Promise<Response> {
  const onboarding = new OnboardingService(app);
  const validation = new OnboardingValidationService(app);
  const chat = new SetupChatService(app);

  return async function handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (routeKey(request.method, url.pathname)) {
      case "GET /health":
        return json({
          ok: true,
          repos: app.store.listRepos().length,
          jobs: app.store.listReviewJobs().length
        });
      case "POST /internal/github/webhooks":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return handleGitHubWebhook(request, app);
      case "POST /internal/onboarding/validate":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return json(await validation.validate(await request.json() as OnboardingValidationRequest));
      case "POST /internal/onboarding/validate-stream":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return validation.validateStream(
          await request.json() as OnboardingValidationRequest,
          sessionStore
        );
      case "POST /internal/onboarding/exec":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return handleExec(app, sessionStore, await request.json() as { sessionId: string; command: string });
      case "POST /internal/onboarding/chat":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return chat.handleStream(await request.json() as {
          repoFullName: string;
          installationId: number;
          messages: Array<{ role: string; content: string }>;
        });
      case "POST /internal/onboarding/repositories":
        if (!hasRunnerAccess(request, app.env.runnerSharedSecret)) {
          return json({ error: "Forbidden" }, { status: 403 });
        }

        return json({
          repositories: await app.githubInstallations.listInstallationRepositories(
            (await request.json() as { installationId: number }).installationId
          )
        });
      case "POST /webhooks/github":
        return handleGitHubWebhook(request, app);
      case "POST /internal/baselines/refresh":
        await onboarding.refreshBaselines();
        return json({ ok: true });
      default: {
        const repoPath = parseRepoPath(url.pathname);
        if (request.method === "POST" && repoPath?.action === "connect") {
          const payload = await request.json() as {
            installationId: number;
            defaultBranch: string;
            profile?: Partial<ReviewProfile>;
          };
          const record = await onboarding.connectRepository({
            installationId: payload.installationId,
            owner: repoPath.owner,
            repo: repoPath.repo,
            defaultBranch: payload.defaultBranch,
            profile: payload.profile
          });

          return json(record);
        }

        if (request.method === "POST" && repoPath?.action === "bootstrap") {
          const record = await onboarding.bootstrapRepository(`${repoPath.owner}/${repoPath.repo}`);
          return json(record);
        }

        return text("Not found", { status: 404 });
      }
    }
  };
}

async function handleExec(
  app: AppContext,
  sessionStore: SetupSessionStore | undefined,
  payload: { sessionId: string; command: string }
): Promise<Response> {
  const session = sessionStore?.get(payload.sessionId);
  if (!session) {
    return json({ error: "No active VM session" }, { status: 404 });
  }

  const result = await app.sessions.run(session, payload.command, 120);
  return json({
    exitCode: result.exit_code,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timed_out,
    durationMs: result.duration_ms,
  });
}
