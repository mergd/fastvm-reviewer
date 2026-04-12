import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";
import styles from "./ChatPanel.module.css";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (message: string) => void;
  disabled?: boolean;
};

export function ChatPanel({ messages, streaming, onSend, disabled }: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || disabled) return;
    setInput("");
    onSend(trimmed);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>Agent</div>
      </div>

      {messages.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyText}>
            Select a repo to start configuring.<br />
            The agent will analyze it and suggest review instructions.
          </div>
        </div>
      ) : (
        <div className={styles.messages}>
          {messages.map((msg, i) => (
            <div key={i} className={styles.message}>
              <div className={`${styles.messageRole} ${msg.role === "assistant" ? styles.messageRoleAssistant : ""}`}>
                {msg.role === "assistant" ? "Agent" : "You"}
              </div>
              <div className={`${styles.messageContent} ${streaming && i === messages.length - 1 && msg.role === "assistant" ? styles.streaming : ""}`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the repo config…"
          rows={1}
          disabled={disabled || streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || streaming || disabled}
        >
          <ArrowUp size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
