import type { FC } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";

const styles = `
  :root {
    color-scheme: dark;
    --bg: #07111f;
    --panel: rgba(11, 23, 41, 0.82);
    --panel-border: rgba(148, 163, 184, 0.18);
    --text: #e5eefb;
    --muted: #9fb2ca;
    --accent: #73e0ff;
    --accent-2: #a78bfa;
    --success: #6ee7b7;
    --warning: #fbbf24;
    --danger: #fda4af;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    min-height: 100vh;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(115, 224, 255, 0.22), transparent 35%),
      radial-gradient(circle at top right, rgba(167, 139, 250, 0.24), transparent 30%),
      linear-gradient(180deg, #040a14 0%, var(--bg) 100%);
    color: var(--text);
    display: grid;
    place-items: center;
    padding: 32px;
  }

  .shell {
    width: min(760px, 100%);
    background: var(--panel);
    border: 1px solid var(--panel-border);
    border-radius: 28px;
    padding: 28px;
    backdrop-filter: blur(18px);
    box-shadow: 0 20px 80px rgba(2, 6, 23, 0.48);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(110, 231, 183, 0.12);
    color: var(--success);
    font-size: 13px;
    letter-spacing: 0.02em;
  }

  h1 {
    margin: 18px 0 10px;
    font-size: clamp(32px, 5vw, 52px);
    line-height: 0.98;
  }

  p {
    margin: 0;
    color: var(--muted);
    font-size: 16px;
    line-height: 1.6;
  }

  code {
    font-family: "SFMono-Regular", ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
    margin-top: 26px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .detail,
  .card {
    border: 1px solid rgba(148, 163, 184, 0.14);
    background: rgba(15, 23, 42, 0.62);
    border-radius: 20px;
    padding: 16px 18px;
  }

  .detail span,
  .card span {
    display: block;
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  .detail strong,
  .card strong {
    font-size: 16px;
    font-weight: 600;
  }

  .steps {
    margin-top: 24px;
    display: grid;
    gap: 14px;
  }

  .section-title {
    margin: 30px 0 10px;
    font-size: 15px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  label {
    display: block;
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 8px;
  }

  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid rgba(148, 163, 184, 0.16);
    background: rgba(15, 23, 42, 0.9);
    color: var(--text);
    border-radius: 14px;
    padding: 12px 14px;
    font: inherit;
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 26px;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    padding: 12px 16px;
    font-weight: 600;
    transition: transform 120ms ease, opacity 120ms ease;
  }

  button.button {
    border: none;
    cursor: pointer;
  }

  .button.primary {
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #08111f;
  }

  .button.secondary {
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(15, 23, 42, 0.72);
  }

  .button.ghost {
    border: 1px dashed rgba(148, 163, 184, 0.18);
    background: transparent;
  }

  .button:hover {
    transform: translateY(-1px);
    opacity: 0.96;
  }

  .button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    transform: none;
  }

  .notice {
    margin-top: 18px;
    border-radius: 16px;
    padding: 14px 16px;
    font-size: 14px;
  }

  .notice.warning {
    background: rgba(251, 191, 36, 0.12);
    color: var(--warning);
    border: 1px solid rgba(251, 191, 36, 0.18);
  }

  .notice.error {
    background: rgba(253, 164, 175, 0.12);
    color: var(--danger);
    border: 1px solid rgba(253, 164, 175, 0.18);
  }

  .notice.success {
    background: rgba(110, 231, 183, 0.12);
    color: var(--success);
    border: 1px solid rgba(110, 231, 183, 0.18);
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: "SFMono-Regular", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
  }
`;

const setupClientScript = `
  const installationInput = document.getElementById("installationId");
  const repositorySelect = document.getElementById("repositorySelect");
  const initialRepo = new URL(window.location.href).searchParams.get("repo");
  const envKeysInput = document.getElementById("envKeys");
  const secretInputs = document.getElementById("secretInputs");
  const status = document.getElementById("status");
  const rootFiles = document.getElementById("rootFiles");
  const generatedCloudAgents = document.getElementById("generatedCloudAgents");
  const validationLogs = document.getElementById("validationLogs");

  const fieldIds = [
    "rootDir",
    "vmBaseSnapshot",
    "vmMachine",
    "installCommand",
    "lintCommand",
    "typecheckCommand",
    "testCommand",
    "appBootCommand",
    "smokeTestCommand",
    "setupNotes"
  ];

  function setStatus(kind, message) {
    status.className = "notice " + kind;
    status.textContent = message;
  }

  function currentRepo() {
    return repositorySelect.value;
  }

  function profilePayload() {
    return {
      packageManager: "unknown",
      rootDir: document.getElementById("rootDir").value.trim() || "/workspace/repo",
      installCommand: document.getElementById("installCommand").value.trim() || undefined,
      lintCommand: document.getElementById("lintCommand").value.trim() || undefined,
      typecheckCommand: document.getElementById("typecheckCommand").value.trim() || undefined,
      testCommand: document.getElementById("testCommand").value.trim() || undefined,
      appBootCommand: document.getElementById("appBootCommand").value.trim() || undefined,
      smokeTestCommand: document.getElementById("smokeTestCommand").value.trim() || undefined,
      envKeys: envKeysInput.value.split(/\\n+/).map((item) => item.trim()).filter(Boolean),
      vmBaseSnapshot: document.getElementById("vmBaseSnapshot").value.trim() || undefined,
      vmMachine: document.getElementById("vmMachine").value.trim() || undefined,
      setupSource: "heuristic",
      instructionsPath: "cloud-agents.md",
      setupNotes: document.getElementById("setupNotes").value.trim() || undefined
    };
  }

  function secretPayload() {
    const values = {};
    for (const input of secretInputs.querySelectorAll("input[data-secret-key]")) {
      if (input.value.length > 0) {
        values[input.dataset.secretKey] = input.value;
      }
    }
    return values;
  }

  function renderSecretInputs() {
    const keys = envKeysInput.value.split(/\\n+/).map((item) => item.trim()).filter(Boolean);
    if (keys.length === 0) {
      secretInputs.innerHTML = '<div class="card"><span>Secret values</span><strong>Add env var names above to create encrypted inputs for validation.</strong></div>';
      return;
    }

    secretInputs.innerHTML = keys.map((key) => '<div class="card"><label for="secret-' + key + '">' + key + '</label><input id="secret-' + key + '" data-secret-key="' + key + '" placeholder="Optional value for validation"></div>').join("");
  }

  function fillDraft(profile) {
    for (const fieldId of fieldIds) {
      const value = profile[fieldId];
      if (typeof value === "string") {
        document.getElementById(fieldId).value = value;
      } else {
        document.getElementById(fieldId).value = "";
      }
    }
    envKeysInput.value = (profile.envKeys || []).join("\\n");
    renderSecretInputs();
  }

  async function loadRepositories() {
    if (!installationInput.value.trim()) {
      setStatus("error", "Enter an installation id first.");
      return;
    }

    setStatus("warning", "Loading installation repositories...");
    const response = await fetch('/api/setup/github/repositories?installation_id=' + encodeURIComponent(installationInput.value.trim()));
    const payload = await response.json();
    if (!response.ok) {
      setStatus("error", payload.error || "Failed to load repositories.");
      return;
    }

    repositorySelect.innerHTML = '<option value="">Select a repository</option>' + payload.repositories.map((repository) => {
      const suffix = repository.onboarding && repository.onboarding.approvedProfile
        ? ' (configured)'
        : repository.onboarding && repository.onboarding.validation
          ? ' (' + repository.onboarding.validation.status + ')'
          : '';
      return '<option value="' + repository.fullName + '">' + repository.fullName + suffix + '</option>';
    }).join("");
    if (initialRepo) {
      repositorySelect.value = initialRepo;
      if (repositorySelect.value === initialRepo) {
        void loadDraft();
        return;
      }
    }
    setStatus("success", "Repositories loaded. Select one and load its draft.");
  }

  async function loadDraft() {
    if (!installationInput.value.trim() || !currentRepo()) {
      setStatus("error", "Select an installation and repository first.");
      return;
    }

    setStatus("warning", "Detecting repo draft...");
    const response = await fetch('/api/setup/github/draft?installation_id=' + encodeURIComponent(installationInput.value.trim()) + '&repo=' + encodeURIComponent(currentRepo()));
    const payload = await response.json();
    if (!response.ok) {
      setStatus("error", payload.error || "Failed to load repo draft.");
      return;
    }

    fillDraft(payload.repository.draftProfile || payload.repository.approvedProfile || {});
    rootFiles.textContent = (payload.rootFiles || []).join("\\n") || "(none)";
    generatedCloudAgents.textContent = payload.cloudAgentsMarkdown || "(not generated)";
    validationLogs.textContent = payload.repository.validation ? JSON.stringify(payload.repository.validation, null, 2) : "(no validation yet)";
    setStatus("success", "Draft loaded. Edit commands and provide any secret values before validation.");
  }

  async function validateDraft() {
    if (!installationInput.value.trim() || !currentRepo()) {
      setStatus("error", "Select an installation and repository first.");
      return;
    }

    setStatus("warning", "Running validation on the Railway runner...");
    const response = await fetch('/api/setup/github/validate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        installationId: Number(installationInput.value.trim()),
        repoFullName: currentRepo(),
        profile: profilePayload(),
        secrets: secretPayload()
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus("error", payload.error || "Validation failed to start.");
      return;
    }

    generatedCloudAgents.textContent = payload.validation.generatedCloudAgents || "(not generated)";
    validationLogs.textContent = JSON.stringify(payload.validation, null, 2);
    setStatus(payload.validation.status === 'passed' ? 'success' : 'error', payload.validation.summary || 'Validation finished.');
  }

  async function approveDraft() {
    if (!installationInput.value.trim() || !currentRepo()) {
      setStatus("error", "Select an installation and repository first.");
      return;
    }

    setStatus("warning", "Activating the repository and committing reviewer files...");
    const response = await fetch('/api/setup/github/approve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        installationId: Number(installationInput.value.trim()),
        repoFullName: currentRepo(),
        profile: profilePayload()
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus("error", payload.error || "Failed to commit cloud-agents.md.");
      return;
    }

    generatedCloudAgents.textContent = payload.cloudAgentsMarkdown || generatedCloudAgents.textContent;
    setStatus("success", "Repository activated. cloud-agents.md and the reviewer workflow are now committed.");
  }

  document.getElementById("loadRepos").addEventListener("click", loadRepositories);
  document.getElementById("loadDraft").addEventListener("click", loadDraft);
  document.getElementById("validateButton").addEventListener("click", validateDraft);
  document.getElementById("approveButton").addEventListener("click", approveDraft);
  envKeysInput.addEventListener("input", renderSecretInputs);

  if (installationInput.value.trim()) {
    loadRepositories();
  }
`;

type SetupPageProps = {
  installationId?: string;
  setupAction?: string;
  state?: string;
  runnerConfigured: boolean;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
};

const DetailCard: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div class="detail">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const StatusNotice: FC<{ visible: boolean }> = ({ visible }) => visible ? (
  <div class="notice warning">
    Cloudflare onboarding storage is not fully configured yet. Add the D1 binding and
    {" "}
    <code>ONBOARDING_ENCRYPTION_KEY</code>
    {" "}
    before using validation or approval.
  </div>
) : null;

const SetupPage: FC<SetupPageProps> = ({
  installationId,
  setupAction,
  state,
  runnerConfigured,
  storageConfigured,
  encryptionConfigured
}) => {
  const details = [
    installationId ? { label: "Installation", value: installationId } : null,
    setupAction ? { label: "Setup action", value: setupAction } : null,
    state ? { label: "State", value: state } : null,
    { label: "Runner", value: runnerConfigured ? "Connected" : "Missing runner configuration" },
    { label: "Storage", value: storageConfigured ? "Connected" : "Missing D1 binding" },
    { label: "Encryption", value: encryptionConfigured ? "Connected" : "Missing encryption key" }
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>FastVM Reviewer Setup</title>
        <style>{styles}</style>
      </head>
      <body>
        <main class="shell">
          <div class="badge">GitHub App installation received</div>
          <h1>FastVM Reviewer is ready for onboarding.</h1>
          <p>
            Turn repo hints into a deterministic <code>cloud-agents.md</code>. Draft the
            commands, supply any required secrets, validate the setup in FastVM, then commit the
            approved config and reviewer workflow back to the repository.
          </p>
          <section class="grid">
            {details.map((detail) => <DetailCard label={detail.label} value={detail.value} />)}
          </section>
          <StatusNotice visible={!storageConfigured || !encryptionConfigured} />
          <section class="steps">
            <div class="card">
              <span>Flow</span>
              <strong>
                Detect repo hints, confirm commands and env names, validate the build and app boot
                in FastVM, then commit <code>cloud-agents.md</code> and
                {" "}
                <code>.github/workflows/cloud-reviewer.yml</code>.
              </strong>
            </div>
            <div class="card">
              <span>Setup URL</span>
              <strong>https://fastvm-pr-reviewer-api.fldr.workers.dev/setup/github</strong>
            </div>
          </section>

          <h2 class="section-title">Repository</h2>
          <div class="form-grid">
            <div>
              <label for="installationId">Installation ID</label>
              <input
                id="installationId"
                value={installationId ?? ""}
                placeholder="GitHub installation id"
              />
            </div>
            <div>
              <label for="repositorySelect">Repository</label>
              <select id="repositorySelect">
                <option value="">Select a repository</option>
              </select>
            </div>
          </div>

          <div class="actions">
            <button class="button secondary" id="loadRepos">Load repositories</button>
            <button class="button ghost" id="loadDraft">Load draft</button>
          </div>

          <h2 class="section-title">Deterministic Draft</h2>
          <div class="form-grid">
            <div>
              <label for="rootDir">Root directory</label>
              <input id="rootDir" placeholder="/workspace/repo" />
            </div>
            <div>
              <label for="vmBaseSnapshot">VM base snapshot</label>
              <input id="vmBaseSnapshot" placeholder="reviewer-base" />
            </div>
            <div>
              <label for="vmMachine">VM machine</label>
              <input id="vmMachine" placeholder="c1m2" />
            </div>
          </div>

          <div class="form-grid">
            <div>
              <label for="installCommand">Install</label>
              <input id="installCommand" placeholder="bun install" />
            </div>
            <div>
              <label for="lintCommand">Lint</label>
              <input id="lintCommand" placeholder="bun run lint" />
            </div>
            <div>
              <label for="typecheckCommand">Typecheck</label>
              <input id="typecheckCommand" placeholder="bun run typecheck" />
            </div>
            <div>
              <label for="testCommand">Test</label>
              <input id="testCommand" placeholder="bun run test" />
            </div>
            <div>
              <label for="appBootCommand">App boot</label>
              <input id="appBootCommand" placeholder="bun run dev" />
            </div>
            <div>
              <label for="smokeTestCommand">Smoke test</label>
              <input id="smokeTestCommand" placeholder="curl -f http://127.0.0.1:3000/health" />
            </div>
          </div>

          <div class="form-grid">
            <div>
              <label for="envKeys">Environment variable names</label>
              <textarea id="envKeys" placeholder={"DATABASE_URL\nNEXTAUTH_SECRET"} />
            </div>
            <div>
              <label for="setupNotes">Notes</label>
              <textarea
                id="setupNotes"
                placeholder="Validation should prove the app installs, boots, and responds cleanly."
              />
            </div>
          </div>

          <h2 class="section-title">Secret Values</h2>
          <div id="secretInputs" class="steps">
            <div class="card">
              <span>Secret values</span>
              <strong>Add env var names above to create encrypted inputs for validation.</strong>
            </div>
          </div>

          <div class="actions">
            <button class="button primary" id="validateButton">Validate in FastVM</button>
            <button class="button secondary" id="approveButton">Activate repository</button>
            <a class="button ghost" href="/health">Check service health</a>
          </div>

          <h2 class="section-title">Validation Result</h2>
          <div id="status" class="notice warning">Select a repository and load a draft to begin.</div>
          <div class="steps">
            <div class="card">
              <span>Root files</span>
              <pre id="rootFiles">(not loaded)</pre>
            </div>
            <div class="card">
              <span>Generated cloud-agents.md</span>
              <pre id="generatedCloudAgents">(not generated)</pre>
            </div>
            <div class="card">
              <span>Validation logs</span>
              <pre id="validationLogs">(no validation yet)</pre>
            </div>
          </div>
        </main>
        <script dangerouslySetInnerHTML={{ __html: setupClientScript }} />
      </body>
    </html>
  );
};

export function renderGitHubSetupPage(
  url: URL,
  args: {
    runnerConfigured: boolean;
    storageConfigured: boolean;
    encryptionConfigured: boolean;
  }
): string {
  return "<!doctype html>" + renderToString(
    <SetupPage
      installationId={url.searchParams.get("installation_id") ?? undefined}
      setupAction={url.searchParams.get("setup_action") ?? undefined}
      state={url.searchParams.get("state") ?? undefined}
      runnerConfigured={args.runnerConfigured}
      storageConfigured={args.storageConfigured}
      encryptionConfigured={args.encryptionConfigured}
    />
  );
}
