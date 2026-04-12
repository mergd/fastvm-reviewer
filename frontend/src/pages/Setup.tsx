import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ChatPanel, type ChatMessage } from "../components/ChatPanel";
import { ConfigPanel, emptyProfile, type Profile } from "../components/ConfigPanel";
import { Logo } from "../components/Logo";
import { TerminalPanel, createTab, type TerminalTab } from "../components/TerminalPanel";
import styles from "./Setup.module.css";

type SetupConfig = {
  runnerConfigured: boolean;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
};

type Installation = {
  id: number;
  account: string;
  repositories: Array<{
    fullName: string;
    name: string;
    owner: string;
    defaultBranch: string;
  }>;
};

type SessionData = {
  loggedIn: boolean;
  reason?: string;
  login?: string;
  avatarUrl?: string;
  config?: SetupConfig;
  installations?: Installation[];
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
  const initialRepo = params.get("repo") ?? "";

  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedRepo, setSelectedRepo] = useState(initialRepo);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [vmSessionId, setVmSessionId] = useState<string | null>(null);

  const termRef = useRef<{ write: (data: string) => void; addTab: (label: string) => TerminalTab } | null>(null);

  useEffect(() => {
    fetch("/api/setup/session")
      .then((r) => r.json())
      .then((d) => setSession(d as SessionData));
  }, []);

  const allRepos = session?.installations?.flatMap((i) =>
    i.repositories.map((r) => ({ ...r, installationId: i.id }))
  ) ?? [];

  const selectedRepoData = allRepos.find((r) => r.fullName === selectedRepo);

  useEffect(() => {
    if (!selectedRepo || !selectedRepoData) return;
    loadDraft(selectedRepoData.installationId, selectedRepo);
  }, [selectedRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDraft(installationId: number, repo: string) {
    try {
      const r = await fetch(
        `/api/setup/github/draft?installation_id=${installationId}&repo=${encodeURIComponent(repo)}`
      );
      const payload = await r.json() as {
        repository?: { draftProfile?: Partial<Profile>; approvedProfile?: Partial<Profile> };
        error?: string;
      };
      if (!r.ok) return;
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
    } catch {
      // silently fail, user can still fill manually
    }
  }

  const handleValidate = useCallback(async () => {
    if (!selectedRepoData) return;
    setLoading(true);

    const tab = createTab(`validate`);
    termRef.current?.addTab(tab.label);

    try {
      const response = await fetch("/api/setup/github/validate-stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installationId: selectedRepoData.installationId,
          owner: selectedRepoData.owner,
          repo: selectedRepoData.name,
          defaultBranch: selectedRepoData.defaultBranch,
          profile: buildProfilePayload(profile),
          secrets: {},
        }),
      });

      if (!response.ok || !response.body) {
        tab.terminal.writeln(`\x1b[31mError: ${response.statusText}\x1b[0m`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            handleSSEEvent(tab, eventType, data);
          }
        }
      }
    } catch (e) {
      tab.terminal.writeln(`\x1b[31mError: ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
    } finally {
      setLoading(false);
    }
  }, [selectedRepoData, profile]);

  function handleSSEEvent(tab: TerminalTab, event: string, data: Record<string, unknown>) {
    switch (event) {
      case "status":
        tab.terminal.writeln(`\x1b[90m${data.message}\x1b[0m`);
        break;
      case "session":
        setVmSessionId(data.sessionId as string);
        break;
      case "step:start":
        tab.terminal.writeln(`\n\x1b[34m▸ ${data.name}\x1b[0m`);
        if (data.command) {
          tab.terminal.writeln(`\x1b[90m  $ ${(data.command as string).slice(0, 200)}\x1b[0m`);
        }
        break;
      case "step:complete": {
        const status = data.status as string;
        const color = status === "passed" ? "32" : status === "failed" ? "31" : "33";
        const dur = data.durationMs ? ` (${((data.durationMs as number) / 1000).toFixed(1)}s)` : "";
        tab.terminal.writeln(`\x1b[${color}m  ${status}${dur}\x1b[0m`);
        if (data.stdout) {
          const stdout = (data.stdout as string).trim();
          if (stdout) {
            for (const line of stdout.split("\n").slice(-20)) {
              tab.terminal.writeln(`  ${line}`);
            }
          }
        }
        if (data.stderr && data.status === "failed") {
          const stderr = (data.stderr as string).trim();
          if (stderr) {
            for (const line of stderr.split("\n").slice(-10)) {
              tab.terminal.writeln(`\x1b[31m  ${line}\x1b[0m`);
            }
          }
        }
        break;
      }
      case "done": {
        const result = data as { status?: string; summary?: string };
        const passed = result.status === "passed";
        tab.terminal.writeln(`\n\x1b[${passed ? "32" : "31"}m━━━ ${passed ? "Validation passed" : "Validation failed"}\x1b[0m`);
        if (result.summary) {
          tab.terminal.writeln(`\x1b[90m${result.summary}\x1b[0m`);
        }
        break;
      }
    }
  }

  const handleActivate = useCallback(async () => {
    if (!selectedRepoData) return;
    setLoading(true);
    try {
      const r = await fetch("/api/setup/github/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          installationId: selectedRepoData.installationId,
          repoFullName: selectedRepo,
          profile: buildProfilePayload(profile),
        }),
      });
      const payload = await r.json() as { error?: string };
      if (!r.ok) throw new Error(payload.error ?? "Activation failed.");
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Repository activated. \`cloud-agents.md\` and the reviewer workflow have been committed to ${selectedRepo}.`
      }]);
    } catch (e) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `Activation failed: ${e instanceof Error ? e.message : String(e)}`
      }]);
    } finally {
      setLoading(false);
    }
  }, [selectedRepoData, selectedRepo, profile]);

  const handleExec = useCallback(async (command: string) => {
    if (!vmSessionId) {
      termRef.current?.write?.(`\x1b[31mNo active VM session. Run a validation first.\x1b[0m\n`);
      return;
    }
    try {
      const r = await fetch("/api/setup/github/exec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: vmSessionId, command }),
      });
      const result = await r.json() as { stdout?: string; stderr?: string; exitCode?: number; error?: string };
      if (!r.ok) {
        termRef.current?.write?.(`\x1b[31m${result.error ?? "Exec failed"}\x1b[0m\n`);
        return;
      }
      if (result.stdout) termRef.current?.write?.(result.stdout);
      if (result.stderr) termRef.current?.write?.(`\x1b[31m${result.stderr}\x1b[0m`);
    } catch (e) {
      termRef.current?.write?.(`\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m\n`);
    }
  }, [vmSessionId]);

  const handleChatSend = useCallback(async (message: string) => {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setStreaming(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const r = await fetch("/api/setup/github/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repoFullName: selectedRepo,
          installationId: selectedRepoData?.installationId,
          messages: [...messages, { role: "user", content: message }],
        }),
      });

      if (!r.ok || !r.body) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: "Failed to get a response." };
          return next;
        });
        setStreaming(false);
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (eventType === "token") {
              accumulated += data.text;
              setMessages((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: accumulated };
                return next;
              });
            } else if (eventType === "profile:update") {
              setProfile((prev) => ({ ...prev, [data.field]: data.value }));
            }
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Connection lost." };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }, [selectedRepo, selectedRepoData, messages]);

  if (!session) {
    return (
      <div className={styles.page}>
        <header className={styles.topbar}>
          <Logo size={24} />
          <span className={styles.topbarName}>Reviewer</span>
        </header>
        <div className={styles.workspace}>
          <div className={styles.loginNotice}>
            <div className={styles.loginCard}>
              <div className={styles.loginTitle}>Loading…</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!session.loggedIn) {
    return (
      <div className={styles.page}>
        <header className={styles.topbar}>
          <Logo size={24} />
          <span className={styles.topbarName}>Reviewer</span>
        </header>
        <div className={styles.workspace}>
          <div className={styles.loginNotice}>
            <div className={styles.loginCard}>
              <div className={styles.loginTitle}>Sign in to continue</div>
              <div className={styles.loginDesc}>
                You need to be logged in to configure repositories.
              </div>
              <Button variant="primary" href="/auth/github/login">Login with GitHub</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Logo size={24} />
        <span className={styles.topbarName}>Reviewer</span>
        <div className={styles.topbarSep} />
        <select
          className={styles.repoPicker}
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
        >
          <option value="">Select a repository…</option>
          {session.installations?.map((inst) => (
            <optgroup key={inst.id} label={inst.account}>
              {inst.repositories.map((repo) => (
                <option key={repo.fullName} value={repo.fullName}>
                  {repo.fullName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className={styles.topbarRight}>
          {selectedRepo && (
            <Badge variant="accent">{selectedRepo.split("/")[1]}</Badge>
          )}
          <span className={styles.topbarUser}>{session.login}</span>
          <Button variant="ghost" size="sm" href="/auth/github/logout">Log out</Button>
        </div>
      </header>

      <div className={styles.workspace}>
        <div className={styles.chatArea}>
          <ChatPanel
            messages={messages}
            streaming={streaming}
            onSend={handleChatSend}
            disabled={!selectedRepo}
          />
        </div>
        <div className={styles.configArea}>
          <ConfigPanel
            profile={profile}
            onProfileChange={setProfile}
            config={session.config}
            loading={loading}
            onValidate={handleValidate}
            onActivate={handleActivate}
          />
        </div>
        <div className={styles.terminalArea}>
          <TerminalPanel onExec={handleExec} />
        </div>
      </div>
    </div>
  );
}
