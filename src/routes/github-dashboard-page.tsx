import type { FC } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";
import type { GitHubUserSession } from "../auth/github-session";

type PendingRepo = {
  fullName: string;
  installationId: number;
  setupUrl: string;
  hasCloudAgents: boolean;
  hasApprovedProfile: boolean;
};

type DashboardPageProps = {
  oauthConfigured: boolean;
  session?: GitHubUserSession;
  pendingRepos: PendingRepo[];
};

const styles = `
  :root {
    color-scheme: dark;
    --bg: #06111c;
    --panel: rgba(10, 19, 36, 0.84);
    --panel-border: rgba(148, 163, 184, 0.16);
    --text: #ebf2ff;
    --muted: #9cb0c8;
    --accent: #74e0ff;
    --accent-2: #a78bfa;
    --warning: #fbbf24;
    --success: #6ee7b7;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(115, 224, 255, 0.18), transparent 32%),
      radial-gradient(circle at top right, rgba(167, 139, 250, 0.22), transparent 28%),
      linear-gradient(180deg, #040913 0%, var(--bg) 100%);
    color: var(--text);
    padding: 32px;
  }

  .shell {
    width: min(980px, 100%);
    margin: 0 auto;
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 28px;
    padding: 28px;
    backdrop-filter: blur(18px);
    box-shadow: 0 20px 80px rgba(2, 6, 23, 0.42);
  }

  h1 {
    margin: 14px 0 8px;
    font-size: clamp(28px, 4vw, 44px);
    line-height: 1.02;
  }

  p {
    margin: 0;
    color: var(--muted);
    line-height: 1.6;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(116, 224, 255, 0.12);
    color: var(--accent);
    font-size: 13px;
  }

  .notice,
  .repo {
    margin-top: 18px;
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(15, 23, 42, 0.62);
    border-radius: 20px;
    padding: 18px;
  }

  .repo-grid {
    display: grid;
    gap: 16px;
    margin-top: 20px;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    padding: 6px 10px;
    border-radius: 999px;
    font-size: 12px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    color: var(--muted);
  }

  .warning { color: var(--warning); }
  .success { color: var(--success); }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    padding: 12px 16px;
    font-weight: 600;
    text-decoration: none;
  }

  .primary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #08111f;
  }

  .secondary {
    color: var(--text);
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.72);
  }
`;

const RepoCard: FC<{ repo: PendingRepo }> = ({ repo }) => (
  <section class="repo">
    <strong>{repo.fullName}</strong>
    <p>
      This repository already has the reviewer workflow, but onboarding is not complete yet.
    </p>
    <div class="meta">
      <span class={`pill ${repo.hasCloudAgents ? "success" : "warning"}`}>
        {repo.hasCloudAgents ? "cloud-agents.md present" : "cloud-agents.md missing"}
      </span>
      <span class={`pill ${repo.hasApprovedProfile ? "success" : "warning"}`}>
        {repo.hasApprovedProfile ? "Approved onboarding saved" : "Approved onboarding missing"}
      </span>
      <span class="pill">Installation {repo.installationId}</span>
    </div>
    <div class="actions">
      <a class="button primary" href={repo.setupUrl}>Finish onboarding</a>
    </div>
  </section>
);

const DashboardPage: FC<DashboardPageProps> = ({ oauthConfigured, session, pendingRepos }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>FastVM Reviewer Dashboard</title>
      <style>{styles}</style>
    </head>
    <body>
      <main class="shell">
        <div class="badge">Repository activation dashboard</div>
        <h1>Only explicitly activated repos will run reviews.</h1>
        <p>
          Installing the GitHub App grants access. A repository becomes active after it has the
          reviewer workflow and completes onboarding.
        </p>
        {!oauthConfigured ? (
          <section class="notice">
            <strong>GitHub login is not configured yet.</strong>
            <p>Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to the Worker to enable the dashboard.</p>
          </section>
        ) : !session ? (
          <section class="notice">
            <strong>Sign in with GitHub to view your pending repositories.</strong>
            <div class="actions">
              <a class="button primary" href="/auth/github/login">Login with GitHub</a>
            </div>
          </section>
        ) : (
          <>
            <section class="notice">
              <strong>{session.login}</strong>
              <p>
                Repositories shown below already opted into the reviewer workflow but still need
                onboarding completed before reviews are considered fully active.
              </p>
              <div class="actions">
                <a class="button secondary" href="/auth/github/logout">Log out</a>
              </div>
            </section>
            {pendingRepos.length === 0 ? (
              <section class="notice">
                <strong>No pending repositories.</strong>
                <p>Every visible repo with the reviewer workflow also has onboarding completed.</p>
              </section>
            ) : (
              <div class="repo-grid">
                {pendingRepos.map((repo) => <RepoCard repo={repo} />)}
              </div>
            )}
          </>
        )}
      </main>
    </body>
  </html>
);

export function renderGitHubDashboardPage(props: DashboardPageProps): string {
  return "<!doctype html>" + renderToString(<DashboardPage {...props} />);
}
