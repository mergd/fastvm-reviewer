import type { AppContext } from "../app";
import { json } from "../http";
import { ReviewService } from "../services/review-service";

interface GitHubWebhookEnvelope {
  action?: string;
  installation?: { id: number };
  repository?: {
    name: string;
    default_branch: string;
    owner: { login: string };
  };
  pull_request?: {
    number: number;
  };
  check_run?: {
    pull_requests?: Array<{ number: number }>;
  };
}

export async function handleGitHubWebhook(request: Request, app: AppContext): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!app.githubAuth.verifyWebhookSignature(rawBody, signature)) {
    return json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const eventName = request.headers.get("x-github-event");
  const payload = JSON.parse(rawBody) as GitHubWebhookEnvelope;
  const reviewService = new ReviewService(app);

  switch (eventName) {
    case "installation_repositories": {
      if (payload.action !== "added" || !payload.installation) {
        return json({ ok: true, ignored: true });
      }

      const records = await app.githubInstallations.handleRepositoriesAdded({
        installation: payload.installation,
        repositories_added: (payload as GitHubWebhookEnvelope & {
          repositories_added?: Array<{
            full_name: string;
            name: string;
            owner: { login: string };
            default_branch: string;
          }>;
        }).repositories_added
      });

      return json({
        ok: true,
        onboarded: records.map((record) => record.repo.fullName)
      });
    }
    case "pull_request": {
      if (!payload.installation || !payload.repository || !payload.pull_request) {
        return json({ ok: true, ignored: true });
      }

      switch (payload.action) {
        case "opened":
        case "reopened":
        case "synchronize": {
          const context = await app.githubPullRequests.fromWebhook(payload as never);
          void reviewService.reviewPullRequest(context).catch((error) => {
            console.error("Failed to process PR review", error);
          });

          return json({ ok: true, queued: true });
        }
        default:
          return json({ ok: true, ignored: true });
      }
    }
    case "check_run": {
      if (payload.action !== "rerequested" || !payload.installation || !payload.repository) {
        return json({ ok: true, ignored: true });
      }

      const prNumber = payload.check_run?.pull_requests?.[0]?.number;
      if (!prNumber) {
        return json({ ok: true, ignored: true });
      }

      const key = `${payload.repository.owner.login}/${payload.repository.name}#${prNumber}`;
      const context = app.store.getPullRequestContext(key);
      if (!context) {
        return json({ ok: true, ignored: true, reason: "No cached PR context found" });
      }

      void reviewService.reviewPullRequest(context).catch((error) => {
        console.error("Failed to rerun PR review", error);
      });

      return json({ ok: true, queued: true });
    }
    default:
      return json({ ok: true, ignored: true });
  }
}
