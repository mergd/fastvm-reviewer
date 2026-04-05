import type { AppContext } from "../app";
import { json } from "../http";
import { renderCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import { OnboardingStore } from "../onboarding/d1-store";
import {
  CLOUD_AGENTS_PATH,
  renderReviewerWorkflow,
  REVIEWER_WORKFLOW_PATH
} from "../onboarding/reviewer-activation";
import { encryptSecretValues } from "../onboarding/secret-store";
import type {
  OnboardingValidationRequest,
  OnboardingValidationResult
} from "../onboarding/types";
import { OnboardingDraftService } from "../services/onboarding-draft-service";
import type { ReviewProfile } from "../types";
import type { WorkerEnv } from "../worker-env";

interface ValidatePayload {
  installationId: number;
  repoFullName: string;
  profile: ReviewProfile;
  secrets: Record<string, string>;
}

interface ApprovePayload {
  installationId: number;
  repoFullName: string;
  profile: ReviewProfile;
}

function parseRepoFullName(value: string): { owner: string; repo: string } {
  const [owner, repo] = value.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repo name: ${value}`);
  }

  return { owner, repo };
}

function requireEncryptionKey(env: WorkerEnv): string {
  if (!env.ONBOARDING_ENCRYPTION_KEY) {
    throw new Error("ONBOARDING_ENCRYPTION_KEY is not configured.");
  }

  return env.ONBOARDING_ENCRYPTION_KEY;
}

export async function handleListOnboardingRepositories(
  app: AppContext,
  env: WorkerEnv,
  installationId: number,
  listRepositories?: (installationId: number) => Promise<Array<{
    fullName: string;
    name: string;
    owner: string;
    defaultBranch: string;
  }>>
): Promise<Response> {
  const store = OnboardingStore.require(env.DB);
  const service = new OnboardingDraftService(app.githubInstallations, app.setupAnalyzer);
  const [repositories, storedRecords] = await Promise.all([
    listRepositories ? listRepositories(installationId) : service.listInstallationRepositories(installationId),
    store.listRepositoriesForInstallation(installationId)
  ]);
  const storedByName = new Map(storedRecords.map((record) => [record.repo.fullName, record]));

  return json({
    repositories: repositories.map((repository) => ({
      ...repository,
      onboarding: storedByName.get(repository.fullName) ?? null
    }))
  });
}

export async function handleGetOnboardingDraft(
  app: AppContext,
  env: WorkerEnv,
  args: {
    installationId: number;
    repoFullName: string;
  }
): Promise<Response> {
  const store = OnboardingStore.require(env.DB);
  const service = new OnboardingDraftService(app.githubInstallations, app.setupAnalyzer);
  const { owner, repo } = parseRepoFullName(args.repoFullName);
  const repositories = await service.listInstallationRepositories(args.installationId);
  const repository = repositories.find((item) => item.fullName === args.repoFullName);
  if (!repository) {
    return json({ error: "Repository not found for installation" }, { status: 404 });
  }

  const draft = await service.detectDraft({
    installationId: args.installationId,
    owner,
    repo,
    defaultBranch: repository.defaultBranch,
    store
  });

  return json({
    ...draft,
    cloudAgentsMarkdown: draft.repository.draftProfile
      ? renderCloudAgentsMarkdown(draft.repository.draftProfile)
      : null
  });
}

export async function handleValidateOnboardingDraft(
  app: AppContext,
  env: WorkerEnv,
  payload: ValidatePayload,
  runValidation: (payload: OnboardingValidationRequest) => Promise<OnboardingValidationResult>
): Promise<Response> {
  const store = OnboardingStore.require(env.DB);
  const encryptionKey = requireEncryptionKey(env);
  const { owner, repo } = parseRepoFullName(payload.repoFullName);
  const repositories = await app.githubInstallations.listInstallationRepositories(payload.installationId);
  const repository = repositories.find((item) => item.fullName === payload.repoFullName);
  if (!repository) {
    return json({ error: "Repository not found for installation" }, { status: 404 });
  }

  const repoRecord = await store.saveRepository({
    owner,
    name: repo,
    fullName: payload.repoFullName,
    defaultBranch: repository.defaultBranch,
    installationId: payload.installationId
  }, payload.profile);

  const encryptedSecrets = await encryptSecretValues(payload.secrets, encryptionKey);
  await store.saveSecrets(payload.repoFullName, encryptedSecrets);

  const validation = await runValidation({
    installationId: payload.installationId,
    owner,
    repo,
    defaultBranch: repository.defaultBranch,
    profile: payload.profile,
    secrets: payload.secrets
  });
  await store.saveValidation(payload.repoFullName, validation, validation.status === "failed" ? validation.summary : undefined);

  return json({
    repository: await store.getRepository(repoRecord.repo.fullName),
    validation
  });
}

export async function handleApproveOnboardingDraft(
  app: AppContext,
  env: WorkerEnv,
  payload: ApprovePayload,
  activateRepository: (payload: ApprovePayload) => Promise<void>
): Promise<Response> {
  const store = OnboardingStore.require(env.DB);
  const { owner, repo } = parseRepoFullName(payload.repoFullName);
  const markdown = renderCloudAgentsMarkdown(payload.profile);
  await activateRepository(payload);
  await app.githubInstallations.upsertTextFile({
    installationId: payload.installationId,
    owner,
    repo,
    path: CLOUD_AGENTS_PATH,
    content: markdown,
    message: "chore: add cloud-agents.md onboarding config"
  });
  await app.githubInstallations.upsertTextFile({
    installationId: payload.installationId,
    owner,
    repo,
    path: REVIEWER_WORKFLOW_PATH,
    content: renderReviewerWorkflow(),
    message: "chore: add cloud reviewer workflow"
  });
  await store.saveApprovedProfile(payload.repoFullName, payload.profile);

  return json({
    repository: await store.getRepository(payload.repoFullName),
    committed: true,
    cloudAgentsMarkdown: markdown,
    workflowPath: REVIEWER_WORKFLOW_PATH,
    storedSecretKeys: (await store.getSecrets(payload.repoFullName)).map((secret) => secret.key)
  });
}
