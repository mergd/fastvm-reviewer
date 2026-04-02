import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { parseCloudAgentsMarkdown, renderCloudAgentsMarkdown } from "../onboarding/cloud-agents";
import type { ReviewProfile } from "../types";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseArgs(argv: string[]): { repoPath: string } {
  const repoPathFlagIndex = argv.findIndex((arg) => arg === "--repo-path");
  if (repoPathFlagIndex >= 0 && argv[repoPathFlagIndex + 1]) {
    return {
      repoPath: path.resolve(argv[repoPathFlagIndex + 1])
    };
  }

  return {
    repoPath: process.cwd()
  };
}

async function loadExistingProfile(repoPath: string): Promise<Partial<ReviewProfile>> {
  const cloudAgentsPath = path.join(repoPath, "cloud-agents.md");
  if (await fileExists(cloudAgentsPath)) {
    const markdown = await readFile(cloudAgentsPath, "utf8");
    return parseCloudAgentsMarkdown(markdown) ?? {};
  }

  return {
    rootDir: ".",
    envKeys: [],
    setupNotes: "Fill in the commands the cloud agent should use for this repository."
  };
}

async function prompt(
  rl: readline.Interface,
  label: string,
  value?: string
): Promise<string | undefined> {
  const suffix = value ? ` [${value}]` : "";
  const answer = (await rl.question(`${label}${suffix}: `)).trim();
  return answer || value;
}

function parseEnvKeys(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const existing = await loadExistingProfile(args.repoPath);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log(`Configuring cloud-agent setup for ${args.repoPath}`);
    const profile: Partial<ReviewProfile> = {
      vmBaseSnapshot: await prompt(rl, "VM base snapshot", existing.vmBaseSnapshot),
      vmMachine: await prompt(rl, "VM machine type", existing.vmMachine ?? "c1m2"),
      rootDir: await prompt(rl, "Root directory inside the repo", existing.rootDir ?? "."),
      installCommand: await prompt(rl, "Install command", existing.installCommand),
      appBootCommand: await prompt(rl, "Dev server or app boot command", existing.appBootCommand),
      lintCommand: await prompt(rl, "Lint command", existing.lintCommand),
      typecheckCommand: await prompt(rl, "Typecheck command", existing.typecheckCommand),
      testCommand: await prompt(rl, "Test command", existing.testCommand),
      smokeTestCommand: await prompt(rl, "Smoke test command", existing.smokeTestCommand),
      envKeys: parseEnvKeys(
        await prompt(rl, "Environment variable names (comma-separated)", (existing.envKeys ?? []).join(", "))
      ),
      setupNotes: await prompt(rl, "Setup notes", existing.setupNotes)
    };

    const markdown = renderCloudAgentsMarkdown(profile);
    const outputPath = path.join(args.repoPath, "cloud-agents.md");
    await writeFile(outputPath, markdown, "utf8");

    console.log(`Wrote ${outputPath}`);
    console.log("Next step: provide the actual env var values through your secret/config path, not in cloud-agents.md.");
  } finally {
    rl.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
