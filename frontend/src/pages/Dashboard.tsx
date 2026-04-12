import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { Notice } from "../components/Notice";
import styles from "./Dashboard.module.css";

const PAGE_SIZE = 20;

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absoluteTimeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

type PendingRepo = {
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
};

type DashboardData = {
  loggedIn: boolean;
  login?: string;
  avatarUrl?: string;
  pendingRepos: PendingRepo[];
};

function compareTimestampDesc(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY;
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY;

  return rightTime - leftTime;
}

function formatRelativeTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const diffMs = timestamp - Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (Math.abs(diffMs) < hour) {
    return relativeTimeFormatter.format(Math.round(diffMs / minute), "minute");
  }

  if (Math.abs(diffMs) < day) {
    return relativeTimeFormatter.format(Math.round(diffMs / hour), "hour");
  }

  if (Math.abs(diffMs) < 30 * day) {
    return relativeTimeFormatter.format(Math.round(diffMs / day), "day");
  }

  return absoluteTimeFormatter.format(new Date(timestamp));
}

function getStatus(repo: PendingRepo): {
  badge: string;
  badgeVariant: "default" | "accent" | "success" | "warning" | "danger";
  detail: string;
  actionLabel: string;
} {
  if (!repo.hasReviewerWorkflow) {
    return {
      badge: "Not set up",
      badgeVariant: "default",
      detail: "No reviewer workflow yet",
      actionLabel: "Set up"
    };
  }

  if (!repo.hasCloudAgents) {
    return {
      badge: "Needs config",
      badgeVariant: "warning",
      detail: "Missing cloud-agents.md",
      actionLabel: "Finish setup"
    };
  }

  return {
    badge: "Profile pending",
    badgeVariant: "accent",
    detail: "Waiting for approved profile",
    actionLabel: "Finish setup"
  };
}

function LastTouchedCell({ value }: { value: string | null }) {
  if (!value) {
    return <span className={styles.muted}>Unknown</span>;
  }

  const absolute = absoluteTimeFormatter.format(new Date(value));

  return (
    <time className={styles.lastTouched} dateTime={value} title={absolute}>
      <span>{formatRelativeTimestamp(value)}</span>
      <span className={styles.lastTouchedAbsolute}>{absolute}</span>
    </time>
  );
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setData(d as DashboardData))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [data]);

  const repos = useMemo(
    () =>
      [...(data?.pendingRepos ?? [])].sort(
        (left, right) =>
          compareTimestampDesc(left.lastTouchedAt, right.lastTouchedAt) ||
          left.fullName.localeCompare(right.fullName)
      ),
    [data]
  );

  const totalPages = Math.max(1, Math.ceil(repos.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleRepos = repos.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Logo size={24} />
        <span className={styles.topbarName}>Reviewer</span>
      </header>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>Repository activation</h1>
          <p className={styles.desc}>
            Only explicitly activated repos run reviews. Install the GitHub App, then complete
            onboarding to activate a repository.
          </p>
        </div>

        <div className={styles.body}>
          {error ? (
            <Notice variant="error">{error}</Notice>
          ) : !data ? (
            <p className={styles.loading}>Loading…</p>
          ) : !data.loggedIn ? (
            <div className={styles.loginBlock}>
              <div className={styles.loginBlockHeader}>
                <div className={styles.loginTitle}>Sign in with GitHub</div>
                <div className={styles.loginSubtitle}>
                  Sign in to see repositories available to the reviewer app.
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
                      Repos accessible to the reviewer app that still need setup.
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" href="/auth/github/logout">Log out</Button>
                </div>
              </Notice>

              {data.pendingRepos.length === 0 ? (
                <Notice>
                  <strong>All repos are activated.</strong>
                  {" "}Every accessible repo has completed onboarding.
                </Notice>
              ) : (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionLabel}>Pending repositories</div>
                    <div className={styles.sectionMeta}>
                      {repos.length} repo{repos.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className={styles.tableCard}>
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th scope="col">Project</th>
                            <th scope="col">Status</th>
                            <th scope="col">Last touched</th>
                            <th scope="col">Install</th>
                            <th scope="col" className={styles.actionHeader}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRepos.map((repo) => {
                            const status = getStatus(repo);

                            return (
                              <tr key={repo.fullName}>
                                <td>
                                  <div className={styles.projectCell}>
                                    <div className={styles.projectMeta}>
                                      <div className={styles.projectHeader}>
                                        <a
                                          className={styles.repoLink}
                                          href={repo.htmlUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <span className={styles.repoName}>{repo.fullName}</span>
                                        </a>
                                        {repo.isFork ? <Badge variant="accent">Fork</Badge> : null}
                                      </div>
                                      {repo.description ? (
                                        <a
                                          className={styles.repoDescription}
                                          href={repo.htmlUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          title={repo.description}
                                        >
                                          {repo.description}
                                        </a>
                                      ) : (
                                        <span className={styles.repoDescriptionEmpty}>No description</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <div className={styles.statusCell}>
                                    <Badge variant={status.badgeVariant}>{status.badge}</Badge>
                                    <span className={styles.statusDetail}>{status.detail}</span>
                                  </div>
                                </td>
                                <td>
                                  <LastTouchedCell value={repo.lastTouchedAt} />
                                </td>
                                <td>
                                  <span className={styles.installationId}>#{repo.installationId}</span>
                                </td>
                                <td className={styles.actionCell}>
                                  <Button
                                    variant={repo.hasReviewerWorkflow ? "primary" : "secondary"}
                                    size="sm"
                                    href={repo.setupUrl}
                                  >
                                    {status.actionLabel}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.pagination}>
                      <div className={styles.paginationMeta}>
                        Showing {pageStart + 1}-{Math.min(pageStart + visibleRepos.length, repos.length)} of{" "}
                        {repos.length}
                      </div>
                      <div className={styles.paginationActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage === 1}
                          onClick={() => setPage((value) => Math.max(1, value - 1))}
                        >
                          Previous
                        </Button>
                        <span className={styles.pageIndicator}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentPage === totalPages}
                          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
