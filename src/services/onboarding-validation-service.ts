import type { AppContext } from "../app";
import { renderCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import { normalizeReviewProfile } from "../onboarding/review-profile";
import type {
  OnboardingValidationRequest,
  OnboardingValidationResult,
  OnboardingValidationStep
} from "../onboarding/types";
import type { SetupSessionStore } from "./setup-session-store";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function buildEnvPrefix(values: Record<string, string>): string {
  const exports = Object.entries(values)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `export ${key}=${shellEscape(value)}`);

  return exports.length > 0 ? `${exports.join(" && ")} && ` : "";
}

export class OnboardingValidationService {
  constructor(private readonly app: AppContext) {}

  async validate(request: OnboardingValidationRequest): Promise<OnboardingValidationResult> {
    const profile = normalizeReviewProfile(request.profile);
    const session = await this.app.sessions.startReviewSession(
      `${request.owner}/${request.repo}`,
      profile.vmBaseSnapshot
    );
    const repoDir = profile.rootDir || session.workspacePath;
    const envPrefix = buildEnvPrefix(request.secrets);
    const steps: OnboardingValidationStep[] = [];

    try {
      const installationToken = await this.app.githubAuth.createInstallationToken(request.installationId);
      const remoteUrl = `https://x-access-token:${installationToken}@github.com/${request.owner}/${request.repo}.git`;
      await this.runStep(steps, {
        name: "clone",
        command: [
          "set -euo pipefail",
          `mkdir -p ${shellEscape(repoDir)}`,
          `if [ ! -d ${shellEscape(`${repoDir}/.git`)} ]; then git clone ${shellEscape(remoteUrl)} ${shellEscape(repoDir)}; fi`,
          `${envPrefix}cd ${shellEscape(repoDir)}`,
          `git remote set-url origin ${shellEscape(remoteUrl)}`,
          "git fetch origin --prune",
          `git checkout -f ${shellEscape(request.defaultBranch)}`,
          `git reset --hard ${shellEscape(`origin/${request.defaultBranch}`)}`
        ].join(" && "),
        timeoutSec: 600,
        session
      });

      await this.maybeRunCommandStep(steps, session, repoDir, envPrefix, "install", profile.installCommand, 1200);
      await this.maybeRunCommandStep(steps, session, repoDir, envPrefix, "lint", profile.lintCommand, 300);
      await this.maybeRunCommandStep(steps, session, repoDir, envPrefix, "typecheck", profile.typecheckCommand, 300);
      await this.maybeRunCommandStep(steps, session, repoDir, envPrefix, "test", profile.testCommand, 600);

      if (profile.appBootCommand) {
        const bootCommand = `${envPrefix}cd ${shellEscape(repoDir)} && ${profile.appBootCommand}`;
        await this.runStep(steps, {
          name: "app_boot",
          command: `tmux new-session -d -s reviewer-app ${shellEscape(bootCommand)} && sleep 8 && tmux has-session -t reviewer-app && tmux capture-pane -pt reviewer-app`,
          timeoutSec: 90,
          session
        });
      } else {
        steps.push({
          name: "app_boot",
          status: "skipped",
          reason: "No app boot command configured"
        });
      }

      await this.maybeRunCommandStep(steps, session, repoDir, envPrefix, "smoke", profile.smokeTestCommand, 300);

      return {
        status: "passed",
        summary: "Validation passed. Review the generated cloud-agents.md and logs before approving.",
        steps,
        generatedCloudAgents: renderCloudAgentsMarkdown(profile),
        validatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "failed",
        summary: error instanceof Error ? error.message : String(error),
        steps,
        generatedCloudAgents: renderCloudAgentsMarkdown(profile),
        validatedAt: new Date().toISOString()
      };
    } finally {
      await this.app.sessions.cleanup(session);
    }
  }

  validateStream(
    request: OnboardingValidationRequest,
    sessionStore?: SetupSessionStore
  ): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async (controller) => {
        const emit = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const profile = normalizeReviewProfile(request.profile);
        let session: Awaited<ReturnType<AppContext["sessions"]["startReviewSession"]>> | undefined;
        const steps: OnboardingValidationStep[] = [];

        try {
          emit("status", { message: "Starting VM…" });
          session = await this.app.sessions.startReviewSession(
            `${request.owner}/${request.repo}`,
            profile.vmBaseSnapshot
          );

          const sessionId = session.id;
          if (sessionStore) {
            sessionStore.set(sessionId, session);
            emit("session", { sessionId });
          }

          const repoDir = profile.rootDir || session.workspacePath;
          const envPrefix = buildEnvPrefix(request.secrets);

          const runStepStreaming = async (name: string, command: string, timeoutSec: number) => {
            emit("step:start", { name, command });
            const result = await this.app.sessions.run(session!, command, timeoutSec);
            const step: OnboardingValidationStep = {
              name,
              status: result.exit_code === 0 ? "passed" : "failed",
              command,
              reason: result.exit_code === 0 ? undefined : result.stderr || result.stdout || `${name} failed`,
              stdout: result.stdout,
              stderr: result.stderr,
              durationMs: result.duration_ms
            };
            steps.push(step);
            emit("step:complete", { name, status: step.status, durationMs: step.durationMs, stdout: result.stdout, stderr: result.stderr });
            if (result.exit_code !== 0) {
              throw new Error(result.stderr || result.stdout || `${name} failed`);
            }
          };

          const maybeRunStreaming = async (name: string, command: string | undefined, timeoutSec: number) => {
            if (!command) {
              steps.push({ name, status: "skipped", reason: "No command configured" });
              emit("step:complete", { name, status: "skipped" });
              return;
            }
            await runStepStreaming(name, `${envPrefix}cd ${shellEscape(repoDir)} && ${command}`, timeoutSec);
          };

          const installationToken = await this.app.githubAuth.createInstallationToken(request.installationId);
          const remoteUrl = `https://x-access-token:${installationToken}@github.com/${request.owner}/${request.repo}.git`;
          await runStepStreaming("clone", [
            "set -euo pipefail",
            `mkdir -p ${shellEscape(repoDir)}`,
            `if [ ! -d ${shellEscape(`${repoDir}/.git`)} ]; then git clone ${shellEscape(remoteUrl)} ${shellEscape(repoDir)}; fi`,
            `${envPrefix}cd ${shellEscape(repoDir)}`,
            `git remote set-url origin ${shellEscape(remoteUrl)}`,
            "git fetch origin --prune",
            `git checkout -f ${shellEscape(request.defaultBranch)}`,
            `git reset --hard ${shellEscape(`origin/${request.defaultBranch}`)}`
          ].join(" && "), 600);

          await maybeRunStreaming("install", profile.installCommand, 1200);
          await maybeRunStreaming("lint", profile.lintCommand, 300);
          await maybeRunStreaming("typecheck", profile.typecheckCommand, 300);
          await maybeRunStreaming("test", profile.testCommand, 600);

          if (profile.appBootCommand) {
            const bootCmd = `${envPrefix}cd ${shellEscape(repoDir)} && ${profile.appBootCommand}`;
            await runStepStreaming("app_boot",
              `tmux new-session -d -s reviewer-app ${shellEscape(bootCmd)} && sleep 8 && tmux has-session -t reviewer-app && tmux capture-pane -pt reviewer-app`,
              90
            );
          } else {
            steps.push({ name: "app_boot", status: "skipped", reason: "No app boot command configured" });
            emit("step:complete", { name: "app_boot", status: "skipped" });
          }

          await maybeRunStreaming("smoke", profile.smokeTestCommand, 300);

          const result: OnboardingValidationResult = {
            status: "passed",
            summary: "Validation passed.",
            steps,
            generatedCloudAgents: renderCloudAgentsMarkdown(profile),
            validatedAt: new Date().toISOString()
          };
          emit("done", result);
        } catch (error) {
          const result: OnboardingValidationResult = {
            status: "failed",
            summary: error instanceof Error ? error.message : String(error),
            steps,
            generatedCloudAgents: renderCloudAgentsMarkdown(profile),
            validatedAt: new Date().toISOString()
          };
          emit("done", result);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive"
      }
    });
  }

  private async maybeRunCommandStep(
    steps: OnboardingValidationStep[],
    session: Awaited<ReturnType<AppContext["sessions"]["startReviewSession"]>>,
    repoDir: string,
    envPrefix: string,
    name: string,
    command: string | undefined,
    timeoutSec: number
  ): Promise<void> {
    if (!command) {
      steps.push({
        name,
        status: "skipped",
        reason: "No command configured"
      });
      return;
    }

    await this.runStep(steps, {
      name,
      command: `${envPrefix}cd ${shellEscape(repoDir)} && ${command}`,
      timeoutSec,
      session
    });
  }

  private async runStep(
    steps: OnboardingValidationStep[],
    args: {
      name: string;
      command: string;
      timeoutSec: number;
      session: Awaited<ReturnType<AppContext["sessions"]["startReviewSession"]>>;
    }
  ): Promise<void> {
    const result = await this.app.sessions.run(args.session, args.command, args.timeoutSec);
    steps.push({
      name: args.name,
      status: result.exit_code === 0 ? "passed" : "failed",
      command: args.command,
      reason: result.exit_code === 0 ? undefined : result.stderr || result.stdout || `${args.name} failed`,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.duration_ms
    });

    if (result.exit_code !== 0) {
      throw new Error(result.stderr || result.stdout || `${args.name} failed`);
    }
  }
}
