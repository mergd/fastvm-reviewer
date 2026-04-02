export type OnboardingState =
  | "pending"
  | "bootstrapping"
  | "validating"
  | "ready"
  | "error";

export type BaselineHealth = "fresh" | "stale" | "rebuilding" | "failed";

export type ReviewVerdict = "pass" | "warn" | "fail" | "error";

export type ReviewFindingSeverity = "info" | "warning" | "error";

export type ReviewFindingCategory =
  | "code_quality"
  | "verification"
  | "environment"
  | "baseline"
  | "security";

export type ReviewEventKind =
  | "pull_request"
  | "check_run_rerequested"
  | "installation"
  | "installation_repositories";

export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  installationId: number;
}

export interface ReviewProfile {
  packageManager: "bun" | "npm" | "pnpm" | "yarn" | "unknown";
  rootDir: string;
  installCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  testCommand?: string;
  appBootCommand?: string;
  smokeTestCommand?: string;
  envKeys: string[];
  vmBaseSnapshot?: string;
  vmMachine?: string;
  setupSource?: "cloud-agents.md" | "openai" | "heuristic";
  instructionsPath?: string;
  setupNotes?: string;
}

export interface SetupDocument {
  path: string;
  content: string;
}

export interface SetupAnalysis {
  profile: Partial<ReviewProfile>;
  confidence: "low" | "medium" | "high";
  rationale: string;
  missingInformation: string[];
}

export interface BaselineSnapshot {
  activeSnapshotId?: string;
  previousSnapshotId?: string;
  sourceCommitSha?: string;
  builtAt?: string;
  lastValidatedAt?: string;
  health: BaselineHealth;
  stalenessReason?: string;
}

export interface RepoRecord {
  repo: RepoRef;
  onboardingState: OnboardingState;
  reviewProfile?: ReviewProfile;
  baseline: BaselineSnapshot;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface PullRequestFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  installationId: number;
  prNumber: number;
  title: string;
  htmlUrl: string;
  headSha: string;
  baseSha: string;
  headRef: string;
  baseRef: string;
  defaultBranch: string;
  cloneUrl: string;
  changedFiles: PullRequestFile[];
}

export interface ReviewRequest {
  owner: string;
  repo: string;
  prNumber: number;
  installationId: number;
}

export interface ReviewFinding {
  id: string;
  title: string;
  summary: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  source: "heuristic" | "command" | "github" | "system";
  filePath?: string;
  line?: number;
  suggestion?: string;
}

export interface CommandLog {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface VerificationStepResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  command?: string;
  logs?: CommandLog;
  reason?: string;
}

export interface ReviewReport {
  verdict: ReviewVerdict;
  summary: string;
  findings: ReviewFinding[];
  changedFiles: string[];
  verificationSteps: VerificationStepResult[];
  logs: CommandLog[];
  baselineHealth: BaselineHealth;
  baselineSnapshotId?: string;
  generatedAt: string;
}

export interface FastVmMachine {
  id: string;
  name: string;
  machine_name: string;
  status: string;
  source_name?: string;
}

export interface FastVmSnapshot {
  id: string;
  name: string;
  status: string;
  vm_id?: string;
  created_at?: string;
}

export interface FastVmCommandResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
  duration_ms: number;
}

export interface ReviewerSession {
  id: string;
  repoFullName: string;
  baselineSnapshotId?: string;
  vmId: string;
  workspacePath: string;
  createdAt: string;
}

export interface PreparedRepo {
  workspacePath: string;
  diffSummary: string;
  diffPatch: string;
  changedFiles: string[];
  headSha: string;
  baseSha: string;
}

export interface GitHubCheckRun {
  id: number;
  html_url?: string;
  status: string;
  conclusion?: string;
}

export interface ReviewJob {
  id: string;
  repoFullName: string;
  status: "queued" | "running" | "completed" | "failed";
  request: ReviewRequest;
  report?: ReviewReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaselineRefreshJob {
  repoFullName: string;
  startedAt: string;
  completedAt?: string;
  status: "queued" | "running" | "completed" | "failed";
  error?: string;
}
