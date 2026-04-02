import { randomUUID } from "node:crypto";
import type { AppContext } from "../app";
import { RepoPreparer } from "../repo/prepare-repo";
import { CodeInspectionRunner } from "../review/code-inspection";
import { buildReviewReport } from "../review/report";
import { VerificationRunner } from "../review/verification";
import type { PullRequestContext, RepoRecord, ReviewJob } from "../types";

export class ReviewService {
  private readonly preparer: RepoPreparer;
  private readonly inspectionRunner: CodeInspectionRunner;
  private readonly verificationRunner: VerificationRunner;

  constructor(private readonly app: AppContext) {
    this.preparer = new RepoPreparer(app.sessions);
    this.inspectionRunner = new CodeInspectionRunner(app.sessions);
    this.verificationRunner = new VerificationRunner(app.sessions);
  }

  async reviewPullRequest(context: PullRequestContext): Promise<ReviewJob> {
    const repoRecord = this.requireRepoRecord(context);
    const startedAt = new Date().toISOString();
    const job: ReviewJob = {
      id: randomUUID(),
      repoFullName: repoRecord.repo.fullName,
      status: "running",
      request: {
        owner: context.owner,
        repo: context.repo,
        prNumber: context.prNumber,
        installationId: context.installationId
      },
      createdAt: startedAt,
      updatedAt: startedAt
    };
    this.app.store.saveReviewJob(job);

    const checkRun = await this.app.githubCheckRuns.create({
      installationId: context.installationId,
      owner: context.owner,
      repo: context.repo,
      headSha: context.headSha,
      status: "in_progress",
      title: "FastVM Reviewer is running",
      summary: "Restoring baseline and preparing review session."
    });

    if (!repoRecord.baseline.activeSnapshotId) {
      const failedReport = buildReviewReport({
        findings: [
          {
            id: randomUUID(),
            title: "Repo is not review-ready",
            summary: "The repository has not completed onboarding and baseline creation yet.",
            severity: "error",
            category: "baseline",
            source: "system"
          }
        ],
        verificationSteps: [],
        logs: [],
        changedFiles: context.changedFiles.map((file) => file.path),
        baselineHealth: repoRecord.baseline.health,
        baselineSnapshotId: repoRecord.baseline.activeSnapshotId,
        forceVerdict: "fail"
      });
      await this.app.githubCheckRuns.update(
        context.installationId,
        context.owner,
        context.repo,
        checkRun.id,
        failedReport
      );

      const failedJob: ReviewJob = {
        ...job,
        status: "failed",
        report: failedReport,
        error: failedReport.summary,
        updatedAt: new Date().toISOString()
      };

      return this.app.store.saveReviewJob(failedJob);
    }

    const session = await this.app.sessions.startReviewSession(
      repoRecord.repo.fullName,
      repoRecord.baseline.activeSnapshotId
    );

    try {
      const installationToken = await this.app.githubAuth.createInstallationToken(context.installationId);
      const prepared = await this.preparer.prepare(session, context, installationToken);
      const inspection = await this.inspectionRunner.inspect(session, prepared, repoRecord.reviewProfile!);
      const verification = await this.verificationRunner.verify(session, prepared, repoRecord.reviewProfile!);
      const report = buildReviewReport({
        findings: inspection.findings,
        verificationSteps: verification.steps,
        logs: [...inspection.logs, ...verification.logs],
        changedFiles: prepared.changedFiles,
        baselineHealth: repoRecord.baseline.health,
        baselineSnapshotId: repoRecord.baseline.activeSnapshotId
      });

      await this.app.githubCheckRuns.update(
        context.installationId,
        context.owner,
        context.repo,
        checkRun.id,
        report
      );
      await this.app.githubReviewComments.publishSummary(context, report);

      const completedJob: ReviewJob = {
        ...job,
        status: "completed",
        report,
        updatedAt: new Date().toISOString()
      };

      return this.app.store.saveReviewJob(completedJob);
    } catch (error) {
      const failedReport = buildReviewReport({
        findings: [
          {
            id: randomUUID(),
            title: "Reviewer execution failed",
            summary: error instanceof Error ? error.message : String(error),
            severity: "error",
            category: "environment",
            source: "system"
          }
        ],
        verificationSteps: [],
        logs: [],
        changedFiles: context.changedFiles.map((file) => file.path),
        baselineHealth: repoRecord.baseline.health,
        baselineSnapshotId: repoRecord.baseline.activeSnapshotId,
        forceVerdict: "error"
      });
      await this.app.githubCheckRuns.update(
        context.installationId,
        context.owner,
        context.repo,
        checkRun.id,
        failedReport
      );

      const failedJob: ReviewJob = {
        ...job,
        status: "failed",
        report: failedReport,
        error: failedReport.summary,
        updatedAt: new Date().toISOString()
      };

      return this.app.store.saveReviewJob(failedJob);
    } finally {
      await this.app.sessions.cleanup(session);
    }
  }

  private requireRepoRecord(context: PullRequestContext): RepoRecord {
    const fullName = `${context.owner}/${context.repo}`;
    const record = this.app.store.getRepo(fullName);

    if (!record || !record.reviewProfile) {
      throw new Error(`Repository ${fullName} is not onboarded`);
    }

    return record;
  }
}
