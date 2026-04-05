import type { D1DatabaseLike } from "../d1";
import type { RepoRef, ReviewProfile } from "../types";
import type {
  OnboardingRepositoryRecord,
  OnboardingValidationResult,
  StoredSecretValue
} from "./types";

interface RepositoryRow {
  full_name: string;
  installation_id: number;
  owner: string;
  repo: string;
  default_branch: string;
  draft_profile_json: string | null;
  approved_profile_json: string | null;
  secret_keys_json: string | null;
  validation_json: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface SecretRow {
  key_name: string;
  ciphertext: string;
  iv: string;
  key_version: number;
}

export class OnboardingStore {
  constructor(private readonly db: D1DatabaseLike) {}

  static require(db?: D1DatabaseLike): OnboardingStore {
    if (!db) {
      throw new Error("Cloudflare D1 is not configured. Add a DB binding before using onboarding.");
    }

    return new OnboardingStore(db);
  }

  async saveRepository(
    repo: RepoRef,
    draftProfile?: ReviewProfile,
    approvedProfile?: ReviewProfile,
    lastError?: string
  ): Promise<OnboardingRepositoryRecord> {
    const existing = await this.getRepository(repo.fullName);
    const now = new Date().toISOString();
    await this.db.prepare(`
      INSERT INTO onboarding_repositories (
        full_name,
        installation_id,
        owner,
        repo,
        default_branch,
        draft_profile_json,
        approved_profile_json,
        secret_keys_json,
        validation_json,
        last_error,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(full_name) DO UPDATE SET
        installation_id = excluded.installation_id,
        owner = excluded.owner,
        repo = excluded.repo,
        default_branch = excluded.default_branch,
        draft_profile_json = excluded.draft_profile_json,
        approved_profile_json = excluded.approved_profile_json,
        last_error = excluded.last_error,
        updated_at = excluded.updated_at
    `).bind(
      repo.fullName,
      repo.installationId,
      repo.owner,
      repo.name,
      repo.defaultBranch,
      JSON.stringify(draftProfile ?? existing?.draftProfile ?? null),
      JSON.stringify(approvedProfile ?? existing?.approvedProfile ?? null),
      JSON.stringify(existing?.secretKeys ?? []),
      JSON.stringify(existing?.validation ?? null),
      lastError ?? existing?.lastError ?? null,
      existing?.createdAt ?? now,
      now
    ).run();

    return this.requireRepository(repo.fullName);
  }

  async saveValidation(fullName: string, validation: OnboardingValidationResult, lastError?: string): Promise<void> {
    const record = await this.requireRepository(fullName);
    await this.db.prepare(`
      UPDATE onboarding_repositories
      SET validation_json = ?, last_error = ?, updated_at = ?
      WHERE full_name = ?
    `).bind(
      JSON.stringify(validation),
      lastError ?? null,
      new Date().toISOString(),
      fullName
    ).run();
  }

  async saveApprovedProfile(fullName: string, profile: ReviewProfile): Promise<void> {
    await this.db.prepare(`
      UPDATE onboarding_repositories
      SET approved_profile_json = ?, updated_at = ?
      WHERE full_name = ?
    `).bind(
      JSON.stringify(profile),
      new Date().toISOString(),
      fullName
    ).run();
  }

  async saveSecrets(fullName: string, secrets: StoredSecretValue[]): Promise<void> {
    await this.db.prepare("DELETE FROM onboarding_secrets WHERE full_name = ?").bind(fullName).run();

    for (const secret of secrets) {
      await this.db.prepare(`
        INSERT INTO onboarding_secrets (
          full_name,
          key_name,
          ciphertext,
          iv,
          key_version,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        fullName,
        secret.key,
        secret.ciphertext,
        secret.iv,
        secret.keyVersion,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
    }

    await this.db.prepare(`
      UPDATE onboarding_repositories
      SET secret_keys_json = ?, updated_at = ?
      WHERE full_name = ?
    `).bind(
      JSON.stringify(secrets.map((secret) => secret.key)),
      new Date().toISOString(),
      fullName
    ).run();
  }

  async listRepositoriesForInstallation(installationId: number): Promise<OnboardingRepositoryRecord[]> {
    const result = await this.db.prepare(`
      SELECT *
      FROM onboarding_repositories
      WHERE installation_id = ?
      ORDER BY owner, repo
    `).bind(installationId).all<RepositoryRow>();

    return (result.results ?? []).map((row) => this.mapRepository(row));
  }

  async getRepository(fullName: string): Promise<OnboardingRepositoryRecord | undefined> {
    const row = await this.db.prepare(`
      SELECT *
      FROM onboarding_repositories
      WHERE full_name = ?
    `).bind(fullName).first<RepositoryRow>();

    return row ? this.mapRepository(row) : undefined;
  }

  async getSecrets(fullName: string): Promise<StoredSecretValue[]> {
    const result = await this.db.prepare(`
      SELECT key_name, ciphertext, iv, key_version
      FROM onboarding_secrets
      WHERE full_name = ?
      ORDER BY key_name
    `).bind(fullName).all<SecretRow>();

    return (result.results ?? []).map((row) => ({
      key: row.key_name,
      ciphertext: row.ciphertext,
      iv: row.iv,
      keyVersion: row.key_version
    }));
  }

  private async requireRepository(fullName: string): Promise<OnboardingRepositoryRecord> {
    const record = await this.getRepository(fullName);
    if (!record) {
      throw new Error(`Unknown onboarding repository: ${fullName}`);
    }

    return record;
  }

  private mapRepository(row: RepositoryRow): OnboardingRepositoryRecord {
    const repo: RepoRef = {
      owner: row.owner,
      name: row.repo,
      fullName: row.full_name,
      defaultBranch: row.default_branch,
      installationId: row.installation_id
    };

    return {
      repo,
      draftProfile: this.parseJson<ReviewProfile | null>(row.draft_profile_json) ?? undefined,
      approvedProfile: this.parseJson<ReviewProfile | null>(row.approved_profile_json) ?? undefined,
      secretKeys: this.parseJson<string[] | null>(row.secret_keys_json) ?? [],
      validation: this.parseJson<OnboardingValidationResult | null>(row.validation_json) ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastError: row.last_error ?? undefined
    };
  }

  private parseJson<T>(value: string | null): T | undefined {
    if (!value) {
      return undefined;
    }

    return JSON.parse(value) as T;
  }
}
