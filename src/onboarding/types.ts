import type { RepoRef, ReviewProfile } from "../types";

export type OnboardingValidationStatus = "idle" | "running" | "passed" | "failed";

export interface OnboardingValidationStep {
  name: string;
  status: "passed" | "failed" | "skipped";
  command?: string;
  reason?: string;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface OnboardingValidationResult {
  status: OnboardingValidationStatus;
  summary: string;
  steps: OnboardingValidationStep[];
  generatedCloudAgents: string;
  validatedAt: string;
}

export interface OnboardingRepositoryRecord {
  repo: RepoRef;
  draftProfile?: ReviewProfile;
  approvedProfile?: ReviewProfile;
  secretKeys: string[];
  validation?: OnboardingValidationResult;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface OnboardingDraftResponse {
  repository: OnboardingRepositoryRecord;
  rootFiles: string[];
}

export interface StoredSecretValue {
  key: string;
  ciphertext: string;
  iv: string;
  keyVersion: number;
}

export interface OnboardingValidationRequest {
  installationId: number;
  owner: string;
  repo: string;
  defaultBranch: string;
  profile: ReviewProfile;
  secrets: Record<string, string>;
}
