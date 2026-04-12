import { Button } from "./Button";
import { Field } from "./Field";
import styles from "./ConfigPanel.module.css";

export type Profile = {
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

export const emptyProfile: Profile = {
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

type SetupConfig = {
  runnerConfigured: boolean;
  storageConfigured: boolean;
  encryptionConfigured: boolean;
};

type Props = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  config?: SetupConfig;
  loading: boolean;
  onValidate: () => void;
  onActivate: () => void;
};

export function ConfigPanel({ profile, onProfileChange, config, loading, onValidate, onActivate }: Props) {
  const patch = (key: keyof Profile) =>
    (value: string) => onProfileChange({ ...profile, [key]: value });

  return (
    <div className={styles.panel}>
      {config && (
        <div className={styles.statusRow}>
          {[
            { label: "Runner", ok: config.runnerConfigured },
            { label: "Storage", ok: config.storageConfigured },
            { label: "Encryption", ok: config.encryptionConfigured },
          ].map(({ label, ok }) => (
            <div key={label} className={styles.statusPill}>
              <div className={`${styles.statusDot} ${ok ? styles.statusDotOk : styles.statusDotFail}`} />
              <span className={styles.statusLabel}>{label}</span>
              <span className={styles.statusValue}>{ok ? "ok" : "missing"}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Environment</div>
        <div className={styles.grid3}>
          <Field id="rootDir" label="Root directory" value={profile.rootDir} onChange={patch("rootDir")} placeholder="/workspace/repo" />
          <Field id="vmBaseSnapshot" label="Base snapshot" value={profile.vmBaseSnapshot} onChange={patch("vmBaseSnapshot")} placeholder="ubuntu-22.04" />
          <Field id="vmMachine" label="Machine" value={profile.vmMachine} onChange={patch("vmMachine")} placeholder="c1m2" />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Commands</div>
        <div className={styles.grid2}>
          <Field id="installCommand" label="Install" value={profile.installCommand} onChange={patch("installCommand")} placeholder="npm install" />
          <Field id="lintCommand" label="Lint" value={profile.lintCommand} onChange={patch("lintCommand")} placeholder="npm run lint" />
          <Field id="typecheckCommand" label="Typecheck" value={profile.typecheckCommand} onChange={patch("typecheckCommand")} placeholder="npm run typecheck" />
          <Field id="testCommand" label="Test" value={profile.testCommand} onChange={patch("testCommand")} placeholder="npm run test" />
          <Field id="appBootCommand" label="App boot" value={profile.appBootCommand} onChange={patch("appBootCommand")} placeholder="npm run dev" />
          <Field id="smokeTestCommand" label="Smoke test" value={profile.smokeTestCommand} onChange={patch("smokeTestCommand")} placeholder="curl -f http://127.0.0.1:3000/health" />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Context</div>
        <div className={styles.grid2}>
          <Field
            id="envKeys"
            type="textarea"
            label="Env var names"
            value={profile.envKeys}
            onChange={patch("envKeys")}
            placeholder={"DATABASE_URL\nNEXTAUTH_SECRET"}
          />
          <Field
            id="setupNotes"
            type="textarea"
            label="Agent context"
            value={profile.setupNotes}
            onChange={patch("setupNotes")}
            placeholder="Monorepo layout, flaky tests to skip…"
          />
        </div>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" onClick={onValidate} disabled={loading}>
          Validate
        </Button>
        <Button variant="secondary" onClick={onActivate} disabled={loading}>
          Activate
        </Button>
      </div>
    </div>
  );
}
