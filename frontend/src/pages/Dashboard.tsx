import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { Notice } from "../components/Notice";
import styles from "./Dashboard.module.css";

type PendingRepo = {
  fullName: string;
  installationId: number;
  setupUrl: string;
  hasCloudAgents: boolean;
  hasApprovedProfile: boolean;
};

type DashboardData = {
  oauthConfigured: boolean;
  callbackUrl: string;
  loggedIn: boolean;
  login?: string;
  avatarUrl?: string;
  pendingRepos: PendingRepo[];
};

function RepoCard({ repo }: { repo: PendingRepo }) {
  return (
    <div className={styles.repo}>
      <div className={styles.repoHeader}>
        <span className={styles.repoName}>{repo.fullName}</span>
        <Button variant="primary" size="sm" href={repo.setupUrl}>
          Finish onboarding →
        </Button>
      </div>
      <div className={styles.repoPills}>
        <Badge variant={repo.hasCloudAgents ? "success" : "warning"}>
          {repo.hasCloudAgents ? "cloud-agents.md ✓" : "cloud-agents.md missing"}
        </Badge>
        <Badge variant={repo.hasApprovedProfile ? "success" : "warning"}>
          {repo.hasApprovedProfile ? "profile approved" : "profile pending"}
        </Badge>
        <Badge>#{repo.installationId}</Badge>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d as DashboardData))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <Logo size={32} />
          <Badge variant="accent">Repository activation dashboard</Badge>
        </div>
        <h1 className={styles.title}>Only explicitly activated repos will run reviews.</h1>
        <p className={styles.desc}>
          Installing the GitHub App grants access. A repository becomes active after it has the
          reviewer workflow and completes onboarding.
        </p>
      </div>

      <div className={styles.body}>
        {error ? (
          <Notice variant="error">{error}</Notice>
        ) : !data ? (
          <p className={styles.loading}>Loading…</p>
        ) : !data.oauthConfigured ? (
          <Notice variant="warning">
            <strong>GitHub login is not configured.</strong>
            {" "}Add <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> to enable the dashboard.
          </Notice>
        ) : !data.loggedIn ? (
          <div className={styles.loginBlock}>
            <div className={styles.loginBlockHeader}>
              <div className={styles.loginTitle}>Sign in with GitHub</div>
              <div className={styles.loginSubtitle}>
                Must be an owner or member of the org that installed the app.
              </div>
            </div>

            <div className={styles.prereqList}>
              <div className={styles.prereqTitle}>Before logging in, confirm these are set</div>
              <div className={styles.prereqItem}>
                <span className={styles.prereqCheck}>✓</span>
                <div>
                  <code>GITHUB_CLIENT_ID</code> and <code>GITHUB_CLIENT_SECRET</code> are configured as Worker secrets
                </div>
              </div>
              <div className={styles.prereqItem}>
                <span className={`${styles.prereqCheck} ${styles.prereqWarn}`}>!</span>
                <div>
                  <div>OAuth callback URL is set on your GitHub App</div>
                  <div className={styles.prereqCallbackUrl}>{data.callbackUrl}</div>
                  <div className={styles.prereqHint}>
                    Go to <strong>GitHub App settings → General → Callback URL</strong> and add this URL.
                  </div>
                </div>
              </div>
            </div>

            <Button variant="primary" href="/auth/github/login">Login with GitHub</Button>
          </div>
        ) : (
          <>
            <Notice>
              <div className={styles.userRow}>
                <div>
                  <div className={styles.userName}>{data.login}</div>
                  <div className={styles.userMeta}>
                    Repos with the reviewer workflow that still need onboarding completed.
                  </div>
                </div>
                <Button variant="ghost" size="sm" href="/auth/github/logout">Log out</Button>
              </div>
            </Notice>

            {data.pendingRepos.length === 0 ? (
              <Notice>
                <strong>No pending repositories.</strong>
                {" "}Every visible repo with the reviewer workflow has completed onboarding.
              </Notice>
            ) : (
              <div className={styles.repoGrid}>
                {data.pendingRepos.map((repo) => (
                  <RepoCard key={repo.fullName} repo={repo} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
