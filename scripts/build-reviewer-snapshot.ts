import { loadEnv } from "../src/config/env";
import { FastVmClient } from "../src/fastvm/client";

const SNAPSHOT_PREFIX = "reviewer-base";

async function main(): Promise<void> {
  const env = loadEnv();
  const fastVm = new FastVmClient(env.fastVmApiKey);
  const vm = await fastVm.launch("c1m2", `${SNAPSHOT_PREFIX}-builder-${Date.now()}`);

  try {
    const commands = [
      "apt-get update",
      "apt-get install -y git curl unzip tmux python3 python3-pip ripgrep",
      "curl -fsSL https://bun.sh/install | bash",
      "export BUN_INSTALL=/root/.bun && export PATH=$BUN_INSTALL/bin:$PATH && bun --version",
      "pip3 install fastvm"
    ];

    for (const command of commands) {
      const result = await fastVm.run(vm.id, command, 900);
      if (result.exit_code !== 0) {
        throw new Error(`Failed to execute "${command}": ${result.stderr || result.stdout}`);
      }
    }

    const snapshot = await fastVm.snapshot(vm.id, `${SNAPSHOT_PREFIX}-${Date.now()}`);
    console.log(`Created snapshot ${snapshot.id} (${snapshot.name})`);
  } finally {
    await fastVm.remove(vm.id);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
