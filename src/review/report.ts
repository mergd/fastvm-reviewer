import type {
  BaselineHealth,
  CommandLog,
  ReviewFinding,
  ReviewReport,
  VerificationStepResult
} from "../types";

function summarize(
  verdict: ReviewReport["verdict"],
  findings: ReviewFinding[],
  steps: VerificationStepResult[]
): string {
  const failingStep = steps.find((step) => step.status === "failed");
  const topFinding = findings[0];

  if (failingStep) {
    return `Verification failed at "${failingStep.name}"${topFinding ? ` with ${findings.length} finding(s) noted.` : "."}`;
  }

  if (verdict === "warn") {
    return `Verification passed with ${findings.length} non-blocking finding(s).`;
  }

  if (verdict === "error") {
    return "The reviewer encountered an unexpected error.";
  }

  return "Verification and code inspection passed.";
}

export function buildReviewReport(args: {
  findings: ReviewFinding[];
  verificationSteps: VerificationStepResult[];
  logs: CommandLog[];
  changedFiles: string[];
  baselineHealth: BaselineHealth;
  baselineSnapshotId?: string;
  forceVerdict?: ReviewReport["verdict"];
}): ReviewReport {
  const hasVerificationFailure = args.verificationSteps.some((step) => step.status === "failed");
  const hasErrorFinding = args.findings.some((finding) => finding.severity === "error");
  const verdict: ReviewReport["verdict"] = args.forceVerdict
    ?? (hasVerificationFailure || hasErrorFinding
      ? "fail"
      : args.findings.length > 0
        ? "warn"
        : "pass");

  return {
    verdict,
    summary: summarize(verdict, args.findings, args.verificationSteps),
    findings: args.findings,
    changedFiles: args.changedFiles,
    verificationSteps: args.verificationSteps,
    logs: args.logs,
    baselineHealth: args.baselineHealth,
    baselineSnapshotId: args.baselineSnapshotId,
    generatedAt: new Date().toISOString()
  };
}
