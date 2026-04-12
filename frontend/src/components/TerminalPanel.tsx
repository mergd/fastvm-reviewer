import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import "xterm/css/xterm.css";
import styles from "./TerminalPanel.module.css";

type TerminalTab = {
  id: string;
  label: string;
  terminal: Terminal;
  fitAddon: FitAddon;
};

type Props = {
  onExec?: (command: string) => void;
};

let tabCounter = 0;

function createTab(label: string): TerminalTab {
  const terminal = new Terminal({
    fontSize: 12,
    fontFamily: "'SFMono-Regular', ui-monospace, Menlo, monospace",
    theme: {
      background: "#ffffff",
      foreground: "#111128",
      cursor: "#111128",
      selectionBackground: "rgba(91, 78, 224, 0.18)",
      black: "#111128",
      brightBlack: "#606080",
      white: "#dde0f2",
      brightWhite: "#ffffff",
      blue: "#2563eb",
      brightBlue: "#5b4ee0",
      green: "#13885a",
      brightGreen: "#13885a",
      red: "#c42828",
      brightRed: "#c42828",
      yellow: "#a86200",
      brightYellow: "#a86200",
      cyan: "#0e7490",
      brightCyan: "#0e7490",
      magenta: "#5b4ee0",
      brightMagenta: "#5b4ee0",
    },
    convertEol: true,
    scrollback: 5000,
    cursorStyle: "bar",
    cursorBlink: true,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  return { id: `tab-${++tabCounter}`, label, terminal, fitAddon };
}

export function TerminalPanel({ onExec }: Props) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [createTab("terminal")]);
  const [activeId, setActiveId] = useState(() => tabs[0].id);
  const containerRef = useRef<HTMLDivElement>(null);
  const [commandInput, setCommandInput] = useState("");

  const activeTab = tabs.find((t) => t.id === activeId);

  const attachTerminal = useCallback(() => {
    if (!activeTab || !containerRef.current) return;
    containerRef.current.innerHTML = "";
    activeTab.terminal.open(containerRef.current);
    requestAnimationFrame(() => activeTab.fitAddon.fit());
  }, [activeTab]);

  useEffect(() => {
    attachTerminal();
  }, [attachTerminal]);

  useEffect(() => {
    if (!activeTab) return;
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => activeTab.fitAddon.fit());
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeTab]);

  const addTab = useCallback(() => {
    const tab = createTab("terminal");
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const fresh = createTab("terminal");
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[next.length - 1].id);
      }
      return next;
    });
  }, [activeId]);

  const handleCommand = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !commandInput.trim()) return;
    const cmd = commandInput.trim();
    setCommandInput("");
    if (activeTab) {
      activeTab.terminal.writeln(`\x1b[34m❯\x1b[0m ${cmd}`);
    }
    onExec?.(cmd);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`${styles.tab} ${tab.id === activeId ? styles.tabActive : ""}`}
            onClick={() => setActiveId(tab.id)}
          >
            {tab.label}
            <span
              className={styles.tabClose}
              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
            >
              ×
            </span>
          </button>
        ))}
        <button className={styles.addTab} onClick={addTab}>+</button>
      </div>
      <div className={styles.body}>
        <div ref={containerRef} className={styles.termContainer} />
      </div>
      <div className={styles.commandRow}>
        <span className={styles.prompt}>❯</span>
        <input
          className={styles.commandInput}
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={handleCommand}
          placeholder="Run a command…"
        />
      </div>
    </div>
  );
}

export function useTerminalRef() {
  const tabsRef = useRef<TerminalTab[]>([]);
  return {
    write(tabId: string, data: string) {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      tab?.terminal.writeln(data);
    },
    tabsRef,
  };
}

export type { TerminalTab };
export { createTab };
