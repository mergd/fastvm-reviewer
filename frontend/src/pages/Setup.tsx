import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { Logo } from "../components/Logo";
import { Notice } from "../components/Notice";
import styles from "./Setup.module.css";

type SetupConfig = {
  runnerConfigured: boolean;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
};

type Repository = {
  fullName: string;
  onboarding?: {
    approvedProfile?: unknown;
    validation?: { status: string };
  };
};

type Profile = {
  rootDir: string;
  vmBaseSnapshot: string;
  vmMachine: string;
  installCommand: string;
  lintCommand: string;
  typecheckCommand: string;
  testCommand: string;
  appBootCommand: string;
  smokeTestCommand: string;
  envKeys: string;
  setupNotes: string;
};

type StatusState = {
  kind: "default" | "warning" | "error" | "success";
  message: string;
};

const emptyProfile: Profile = {
  rootDir: "",
  vmBaseSnapshot: "",
  vmMachine: "",
  installCommand: "",
  lintCommand: "",
  typecheckCommand: "",
  testCommand: "",
  appBootCommand: "",
  smokeTestCommand: "",
  envKeys: "",
  setupNotes: "",
};

function buildProfilePayload(profile: Profile) {
  return {
    packageManager: "unknown",
    rootDir: profile.rootDir.trim() || "/workspace/repo",
    installCommand: profile.installCommand.trim() || undefined,
    lintCommand: profile.lintCommand.trim() || undefined,
    typecheckCommand: profile.typecheckCommand.trim() || undefined,
    testCommand: profile.testCommand.trim() || undefined,
    appBootCommand: profile.appBootCommand.trim() || undefined,
    smokeTestCommand: profile.smokeTestCommand.trim() || undefined,
    envKeys: profile.envKeys.split(/\n+/).map((s) => s.trim()).filter(Boolean),
    vmBaseSnapshot: profile.vmBaseSnapshot.trim() || undefined,
    vmMachine: profile.vmMachine.trim() || undefined,
    setupSource: "heuristic",
    instructionsPath: "cloud-agents.md",
    setupNotes: profile.setupNotes.trim() || undefined,
  };
}

export function SetupPage() {
  const params = new URLSearchParams(window.location.search);
  const initialInstallId = params.get("installation_id") ?? "";
  const initialRepo = params.get("repo") ?? "";

  const [config, setConfig] = useState<SetupConfig | null>(null);
  const [installationId, setInstallationId] = useState(initialInstallId);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<StatusState>({
    kind: "default",
    message: "Select a repository and load a draft to begin.",
  });
  const [rootFiles, setRootFiles] = useState("(not loaded)");
  const [cloudAgents, setCloudAgents] = useState("(not generated)");
  const [validationLogs, setValidationLogs] = useState("(no validation yet)");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/setup/config")
      .then((r) => r.json())
      .then((d) => setConfig(d as SetupConfig));
  }, []);

  useEffect(() => {
    if (initialInstallId) void loadRepositories(initialInstallId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const envKeys = profile.envKeys.split(/\n+/).map((s) => s.trim()).filter(Boolean);

  async function loadRepositories(id = installationId) {
    if (!id.trim()) {
      setStatus({ kind: "error", message: "Enter an installation ID first." });
      return;
    }
    setLoading(true);
    setStatus({ kind: "warning", message: "Loading installation repositories…" });
    try {
      const r = await fetch(`/api/setup/github/repositories?installation_id=${encodeURIComponent(id.trim())}`);
      const payload = await r.json() as { repositories?: Repository[]; error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Failed to load repositories.");
      setRepositories(payload.repositories ?? []);
      if (initialRepo && payload.repositories?.find((repo) => repo.fullName === initialRepo)) {
        setSelectedRepo(initialRepo);
        await loadDraft(id, initialRepo);
        return;
      }
      setStatus({ kind: "success", message: "Repositories loaded. Select one and load its draft." });
    } catch (e: unknown) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Failed to load." });
    } finally {
      setLoading(false);
    }
  }

  async function loadDraft(id = installationId, repo = selectedRepo) {
    if (!id.trim() || !repo) {
      setStatus({ kind: "error", message: "Select an installation and repository first." });
      return;
    }
    setLoading(true);
    setStatus({ kind: "warning", message: "Detecting repo draft…" });
    try {
      const r = await fetch(
        `/api/setup/github/draft?installation_id=${encodeURIComponent(id.trim())}&repo=${encodeURIComponent(repo)}`
      );
      const payload = await r.json() as {
        repository?: { draftProfile?: Partial<Profile>; approvedProfile?: Partial<Profile>; validation?: unknown };
        rootFiles?: string[];
        cloudAgentsMarkdown?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(payload.error ?? "Failed to load draft.");
      const draft = payload.repository?.draftProfile ?? payload.repository?.approvedProfile ?? {};
      setProfile({
        rootDir: draft.rootDir ?? "",
        vmBaseSnapshot: draft.vmBaseSnapshot ?? "",
        vmMachine: draft.vmMachine ?? "",
        installCommand: draft.installCommand ?? "",
        lintCommand: draft.lintCommand ?? "",
        typecheckCommand: draft.typecheckCommand ?? "",
        testCommand: draft.testCommand ?? "",
        appBootCommand: draft.appBootCommand ?? "",
        smokeTestCommand: draft.smokeTestCommand ?? "",
        envKeys: Array.isArray(draft.envKeys) ? (draft.envKeys as string[]).join("\n") : (draft.envKeys ?? ""),
        setupNotes: draft.setupNotes ?? "",
      });
      setRootFiles((payload.rootFiles ?? []).join("\n") || "(none)");
      setCloudAgents(payload.cloudAgentsMarkdown ?? "(not generated)");
      setValidationLogs(
        payload.repository?.validation ? JSON.stringify(payload.repository.validation, null, 2) : "(no validation yet)"
      );
      setStatus({ kind: "success", message: "Draft loaded. Edit commands and provide any secret values before validation." });
    } catch (e: unknown) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Failed to load." });
    } finally {
      setLoading(false);
    }
  }

  async function validate() {
    if (!installationId.trim() || !selectedRepo) {
      setStatus({ kind: "error", message: "Select an installation and repository first." });
      return;
    }
    setLoading(true);
    setStatus({ kind: "warning", message: "Running validation on the Railway runner…" });
    try {
      const r = await fetch("/api/setup/github/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installationId: Number(installationId.trim()),
          repoFullName: selectedRepo,
          profile: buildProfilePayload(profile),
          secrets: secretValues,
        }),
      });
      const payload = await r.json() as { validation?: { generatedCloudAgents?: string; status?: string; summary?: string }; error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Validation failed to start.");
      setCloudAgents(payload.validation?.generatedCloudAgents ?? "(not generated)");
      setValidationLogs(JSON.stringify(payload.validation, null, 2));
      setStatus({
        kind: payload.validation?.status === "passed" ? "success" : "error",
        message: payload.validation?.summary ?? "Validation finished.",
      });
    } catch (e: unknown) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Failed." });
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    if (!installationId.trim() || !selectedRepo) {
      setStatus({ kind: "error", message: "Select an installation and repository first." });
      return;
    }
    setLoading(true);
    setStatus({ kind: "warning", message: "Activating the repository and committing reviewer files…" });
    try {
      const r = await fetch("/api/setup/github/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installationId: Number(installationId.trim()),
          repoFullName: selectedRepo,
          profile: buildProfilePayload(profile),
        }),
      });
      const payload = await r.json() as { cloudAgentsMarkdown?: string; error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Failed to commit cloud-agents.md.");
      if (payload.cloudAgentsMarkdown) setCloudAgents(payload.cloudAgentsMarkdown);
      setStatus({ kind: "success", message: "Repository activated. cloud-agents.md and the reviewer workflow are now committed." });
    } catch (e: unknown) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Failed." });
    } finally {
      setLoading(false);
    }
  }

  function patchProfile(key: keyof Profile) {
    return (value: string) => setProfile((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <div className={styles.logoRow}>
          <Logo size={32} />
          <Badge variant="accent">GitHub App setup</Badge>
        </div>
        <h1 className={styles.title}>FastVM Reviewer is ready for onboarding.</h1>
        <p className={styles.desc}>
          Turn repo hints into a deterministic <code>cloud-agents.md</code>. Draft commands,
          supply secrets, validate in FastVM, then commit the approved config.
        </p>
      </div>

      {config && (
        <div className={styles.statusGrid}>
          {[
            { label: "Runner",     ok: config.runnerConfigured,     ok_label: "Connected", fail_label: "Missing RUNNER_BASE_URL" },
            { label: "Storage",    ok: config.storageConfigured,    ok_label: "Connected", fail_label: "Missing D1 binding" },
            { label: "Encryption", ok: config.encryptionConfigured, ok_label: "Connected", fail_label: "Missing encryption key" },
          ].map(({ label, ok, ok_label, fail_label }) => (
            <div key={label} className={styles.statusItem}>
              <div className={`${styles.statusDot} ${ok ? styles.statusDotOk : styles.statusDotFail}`} />
              <div>
                <div className={styles.statusLabel}>{label}</div>
                <div className={styles.statusValue}>{ok ? ok_label : fail_label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {config && (!config.storageConfigured || !config.encryptionConfigured) && (
        <Notice variant="warning" className={styles.section}>
          Cloudflare onboarding storage is not fully configured. Add the D1 binding and{" "}
          <code>ONBOARDING_ENCRYPTION_KEY</code> before using validation or approval.
        </Notice>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Repository</div>
        <div className={styles.formGrid}>
          <Field
            id="installationId"
            label="Installation ID"
            value={installationId}
            onChange={setInstallationId}
            placeholder="GitHub installation ID"
          />
          <Field
            id="repositorySelect"
            type="select"
            label="Repository"
            value={selectedRepo}
            onChange={setSelectedRepo}
          >
            <option value="">Select a repository</option>
            {repositories.map((repo) => {
              const suffix = repo.onboarding?.approvedProfile
                ? " (configured)"
                : repo.onboarding?.validation
                  ? ` (${repo.onboarding.validation.status})`
                  : "";
              return (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}{suffix}
                </option>
              );
            })}
          </Field>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void loadRepositories()} disabled={loading}>
            Load repositories
          </Button>
          <Button variant="ghost" onClick={() => void loadDraft()} disabled={loading}>
            Load draft
          </Button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Deterministic draft</div>
        <div className={styles.formGrid3}>
          <Field id="rootDir" label="Root directory" value={profile.rootDir} onChange={patchProfile("rootDir")} placeholder="/workspace/repo" />
          <Field id="vmBaseSnapshot" label="VM base snapshot" value={profile.vmBaseSnapshot} onChange={patchProfile("vmBaseSnapshot")} placeholder="reviewer-base" />
          <Field id="vmMachine" label="VM machine" value={profile.vmMachine} onChange={patchProfile("vmMachine")} placeholder="c1m2" />
        </div>
        <div className={styles.formGrid} style={{ marginTop: 10 }}>
          <Field id="installCommand" label="Install" value={profile.installCommand} onChange={patchProfile("installCommand")} placeholder="bun install" />
          <Field id="lintCommand" label="Lint" value={profile.lintCommand} onChange={patchProfile("lintCommand")} placeholder="bun run lint" />
          <Field id="typecheckCommand" label="Typecheck" value={profile.typecheckCommand} onChange={patchProfile("typecheckCommand")} placeholder="bun run typecheck" />
          <Field id="testCommand" label="Test" value={profile.testCommand} onChange={patchProfile("testCommand")} placeholder="bun run test" />
          <Field id="appBootCommand" label="App boot" value={profile.appBootCommand} onChange={patchProfile("appBootCommand")} placeholder="bun run dev" />
          <Field id="smokeTestCommand" label="Smoke test" value={profile.smokeTestCommand} onChange={patchProfile("smokeTestCommand")} placeholder="curl -f http://127.0.0.1:3000/health" />
        </div>
        <div className={styles.formGrid} style={{ marginTop: 10 }}>
          <Field
            id="envKeys"
            type="textarea"
            label="Environment variable names"
            value={profile.envKeys}
            onChange={patchProfile("envKeys")}
            placeholder={"DATABASE_URL\nNEXTAUTH_SECRET"}
          />
          <Field
            id="setupNotes"
            type="textarea"
            label="Notes"
            value={profile.setupNotes}
            onChange={patchProfile("setupNotes")}
            placeholder="Validation should prove the app installs, boots, and responds cleanly."
          />
        </div>
      </div>

      {envKeys.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Secret values</div>
          <div className={styles.secretGrid}>
            {envKeys.map((key) => (
              <Field
                key={key}
                id={`secret-${key}`}
                label={key}
                value={secretValues[key] ?? ""}
                onChange={(value) => setSecretValues((prev) => ({ ...prev, [key]: value }))}
                placeholder="Optional value for validation"
              />
            ))}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void validate()} disabled={loading}>
          Validate in FastVM
        </Button>
        <Button variant="secondary" onClick={() => void approve()} disabled={loading}>
          Activate repository
        </Button>
        <Button variant="ghost" href="/health">
          Check service health
        </Button>
      </div>

      <div className={styles.section} style={{ marginTop: 28 }}>
        <div className={styles.sectionTitle}>Validation result</div>
        <Notice variant={status.kind === "default" ? "default" : status.kind}>
          {status.message}
        </Notice>
        <div className={styles.resultsGrid} style={{ marginTop: 10 }}>
          {[
            { label: "Root files", content: rootFiles },
            { label: "Generated cloud-agents.md", content: cloudAgents },
            { label: "Validation logs", content: validationLogs },
          ].map(({ label, content }) => (
            <div key={label} className={styles.codeBlock}>
              <div className={styles.codeLabel}>{label}</div>
              <pre>{content}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
