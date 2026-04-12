import type { ReviewerSession } from "../types";

const SESSION_TTL_MS = 30 * 60 * 1000;

interface Entry {
  session: ReviewerSession;
  createdAt: number;
}

export class SetupSessionStore {
  private sessions = new Map<string, Entry>();

  set(id: string, session: ReviewerSession): void {
    this.sessions.set(id, { session, createdAt: Date.now() });
    this.evictStale();
  }

  get(id: string): ReviewerSession | undefined {
    const entry = this.sessions.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
      this.sessions.delete(id);
      return undefined;
    }
    return entry.session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private evictStale(): void {
    const now = Date.now();
    for (const [id, entry] of this.sessions) {
      if (now - entry.createdAt > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }
}
