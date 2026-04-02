import type { ReviewProfile } from "../types";

export interface RepoDetection {
  files: string[];
}

function hasFile(detection: RepoDetection, name: string): boolean {
  return detection.files.includes(name);
}

export function inferPackageManager(detection: RepoDetection): ReviewProfile["packageManager"] {
  if (hasFile(detection, "bun.lockb") || hasFile(detection, "bun.lock")) {
    return "bun";
  }

  if (hasFile(detection, "pnpm-lock.yaml")) {
    return "pnpm";
  }

  if (hasFile(detection, "yarn.lock")) {
    return "yarn";
  }

  if (hasFile(detection, "package-lock.json")) {
    return "npm";
  }

  return "unknown";
}

export function defaultInstallCommand(packageManager: ReviewProfile["packageManager"]): string {
  switch (packageManager) {
    case "bun":
      return "bun install --frozen-lockfile";
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
      return "yarn install --immutable";
    case "npm":
      return "npm ci";
    case "unknown":
      return "bun install";
    default: {
      const exhaustiveCheck: never = packageManager;
      return exhaustiveCheck;
    }
  }
}

export function defaultReviewProfile(detection: RepoDetection): ReviewProfile {
  const packageManager = inferPackageManager(detection);

  return {
    packageManager,
    rootDir: "/workspace/repo",
    installCommand: packageManager !== "unknown" ? defaultInstallCommand(packageManager) : undefined,
    envKeys: [],
    setupSource: "heuristic",
    setupNotes: "Fallback profile only. Prefer cloud-agents.md or model-assisted setup analysis before bootstrapping."
  };
}
