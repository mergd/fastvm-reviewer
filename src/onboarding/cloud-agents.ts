import type { ReviewProfile } from "../types";

const SECTION_TITLES = {
  vmBase: ["vm base", "vm base snapshot", "base snapshot", "base image"],
  vmMachine: ["vm machine", "machine", "machine type"],
  rootDir: ["root directory", "root dir", "workspace root"],
  install: ["install", "install command"],
  devServer: ["dev server", "app boot", "start app", "run app"],
  lint: ["lint"],
  typecheck: ["typecheck", "type check"],
  test: ["test", "tests"],
  smoke: ["smoke", "smoke test", "verification", "verify"],
  env: ["environment", "environment variables", "env vars", "env"],
  notes: ["notes", "setup notes"]
} as const;

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase();
}

function headingMatches(value: string, aliases: readonly string[]): boolean {
  const normalized = normalizeHeading(value);
  return aliases.includes(normalized);
}

function firstLine(value?: string): string | undefined {
  const line = value?.split("\n").map((item) => item.trim()).find(Boolean);
  return line || undefined;
}

function stripBullets(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function collectSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentHeading = "";
  let currentBody: string[] = [];

  const flush = (): void => {
    if (!currentHeading) {
      return;
    }

    sections.set(currentHeading, currentBody.join("\n").trim());
  };

  for (const line of markdown.split("\n")) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flush();
      currentHeading = normalizeHeading(match[1]);
      currentBody = [];
      continue;
    }

    currentBody.push(line);
  }

  flush();
  return sections;
}

export function parseCloudAgentsMarkdown(markdown: string): Partial<ReviewProfile> | undefined {
  const sections = collectSections(markdown);
  if (sections.size === 0) {
    return undefined;
  }

  const getSection = (aliases: readonly string[]): string | undefined => {
    for (const [heading, body] of sections.entries()) {
      if (headingMatches(heading, aliases)) {
        return body;
      }
    }

    return undefined;
  };

  const envSection = getSection(SECTION_TITLES.env);
  const notesSection = getSection(SECTION_TITLES.notes);

  return {
    vmBaseSnapshot: firstLine(getSection(SECTION_TITLES.vmBase)),
    vmMachine: firstLine(getSection(SECTION_TITLES.vmMachine)),
    rootDir: firstLine(getSection(SECTION_TITLES.rootDir)),
    installCommand: firstLine(getSection(SECTION_TITLES.install)),
    appBootCommand: firstLine(getSection(SECTION_TITLES.devServer)),
    lintCommand: firstLine(getSection(SECTION_TITLES.lint)),
    typecheckCommand: firstLine(getSection(SECTION_TITLES.typecheck)),
    testCommand: firstLine(getSection(SECTION_TITLES.test)),
    smokeTestCommand: firstLine(getSection(SECTION_TITLES.smoke)),
    envKeys: envSection ? stripBullets(envSection) : undefined,
    setupNotes: notesSection?.trim() || undefined,
    setupSource: "cloud-agents.md",
    instructionsPath: "cloud-agents.md"
  };
}

export function renderCloudAgentsMarkdown(profile: Partial<ReviewProfile>): string {
  const envKeys = (profile.envKeys ?? []).filter(Boolean);
  const sections = [
    "# Cloud Agents",
    "",
    "This file describes how a cloud development agent should prepare, boot, and validate this repository.",
    ""
  ];

  const pushSection = (title: string, body?: string | string[]): void => {
    if (!body || (Array.isArray(body) && body.length === 0)) {
      return;
    }

    sections.push(`## ${title}`);
    sections.push("");
    if (Array.isArray(body)) {
      sections.push(...body);
    } else {
      sections.push(body);
    }
    sections.push("");
  };

  pushSection("VM Base", profile.vmBaseSnapshot);
  pushSection("VM Machine", profile.vmMachine);
  pushSection("Root Directory", profile.rootDir);
  pushSection("Install", profile.installCommand);
  pushSection("Dev Server", profile.appBootCommand);
  pushSection("Lint", profile.lintCommand);
  pushSection("Typecheck", profile.typecheckCommand);
  pushSection("Test", profile.testCommand);
  pushSection("Smoke Test", profile.smokeTestCommand);
  pushSection("Environment Variables", envKeys.map((key) => `- ${key}`));
  pushSection("Notes", profile.setupNotes);

  return `${sections.join("\n").trim()}\n`;
}
