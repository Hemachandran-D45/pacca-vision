import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts", "deploy", "prod-config.sh");

/*
 * scripts/deploy/prod-config.sh against a fake `az` on PATH. The fake records
 * every call (and the content of any --file it is given) and answers lookups
 * with canned values, so nothing here touches Azure.
 */
const FAKE_AZ = `#!/usr/bin/env bash
log="$FAKE_AZ_LOG"
args="$*"
file=""; prev=""
for a in "$@"; do [[ "$prev" == "--file" ]] && file="$(cat "$a")"; prev="$a"; done
echo "CALL $args\${file:+ ||FILE=$file}" >> "$log"
case "$args" in
  "keyvault secret show"*)
    name="$(sed -E 's/.* -n ([^ ]+).*/\\1/' <<<"$args")"
    [[ " $FAKE_KV_EXISTING " == *" $name "* ]] && { echo existing; exit 0; } || exit 1 ;;
  "cosmosdb keys list"*) echo COSMOS-PRIMARY ;;
  "storage account keys list"*) echo STORAGE-KEY2 ;;
  "cognitiveservices account keys list"*) echo OPENAI-KEY2 ;;
  "functionapp keys list"*) echo FUNCTION-HOST-KEY ;;
  "identity show"*) echo /subscriptions/s/resourceGroups/pacca-idp-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-pacca-idp-web ;;
  "containerapp show"*latestRevisionName*)
    # FAKE_NEW_REVISION=1: the update created a revision (rev-1 before, rev-2 after).
    if [[ -n "$FAKE_NEW_REVISION" ]] && grep -q "CALL containerapp update" "$log"; then echo app--rev-2; else echo app--rev-1; fi ;;
esac
exit 0
`;

let dir: string;
let log: string;

function writeEnv(extra: Record<string, string> = {}) {
  const base = fs.readFileSync(path.join(ROOT, "env.prod.example"), "utf8");
  const lines = base.split("\n").map((line) => {
    const key = line.split("=")[0];
    return key in extra ? `${key}=${extra[key]}` : line;
  });
  const file = path.join(dir, ".env.prod");
  fs.writeFileSync(file, lines.join("\n"));
  return file;
}

const BASH = (() => {
  if (process.platform === "win32") {
    if (fs.existsSync("C:\\Program Files\\Git\\bin\\bash.exe")) return "C:\\Program Files\\Git\\bin\\bash.exe";
    if (fs.existsSync("C:\\Program Files\\Git\\usr\\bin\\bash.exe")) return "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
  }
  return "bash";
})();

function run(cmd: string, envFile: string, existing = "", extraEnv: Record<string, string> = {}) {
  const normScript = process.platform === "win32" ? SCRIPT.replace(/\\/g, "/") : SCRIPT;
  const normEnvFile = process.platform === "win32" ? envFile.replace(/\\/g, "/") : envFile;
  return spawnSync(BASH, [normScript, cmd, normEnvFile], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}`, FAKE_AZ_LOG: log, FAKE_KV_EXISTING: existing, ...extraEnv },
  });
}

const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : []);
const setCalls = () => calls().filter((c) => c.startsWith("CALL keyvault secret set"));
const valueOf = (secret: string) =>
  setCalls().find((c) => c.includes(` -n ${secret} `))?.split("||FILE=")[1];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "prodcfg-"));
  log = path.join(dir, "az.log");
  fs.writeFileSync(path.join(dir, "az"), FAKE_AZ, { mode: 0o755 });
});

describe("prod-config.sh secrets", () => {
  it("fills empty secrets from Azure / generation and never prints a value", () => {
    const res = run("secrets", writeEnv({ IVR_API_KEY: '"ivr-from-env"' }));
    expect(res.status, res.stderr).toBe(0);

    expect(setCalls()).toHaveLength(7);
    expect(valueOf("cosmos-key")).toBe("COSMOS-PRIMARY");
    expect(valueOf("storage-key")).toBe("STORAGE-KEY2");
    expect(valueOf("openai-key")).toBe("OPENAI-KEY2");
    expect(valueOf("function-key")).toBe("FUNCTION-HOST-KEY");
    expect(valueOf("ivr-api-key")).toBe("ivr-from-env"); // quotes stripped
    expect(valueOf("jwt-secret")!.length).toBeGreaterThanOrEqual(32);
    expect(valueOf("ivr-writeback-key")).toMatch(/^[0-9a-f]{64}$/);

    // Lookups target the production data plane, using the right key slots.
    expect(calls()).toContainEqual(expect.stringContaining("cosmosdb keys list -n cosmos-senderra-idp -g senderra-idp-rg"));
    expect(calls()).toContainEqual(expect.stringContaining("storage account keys list -n senderraidpsa -g senderra-idp-rg --query [1].value"));
    expect(calls()).toContainEqual(expect.stringContaining("cognitiveservices account keys list -n senderra-idp-fr -g senderra-idp-rg --query key2"));

    // Values travel via --file, never as arguments, and never reach the output.
    for (const c of setCalls()) expect(c.split("||FILE=")[0]).not.toContain("--value");
    const output = res.stdout + res.stderr;
    for (const secret of ["COSMOS-PRIMARY", "STORAGE-KEY2", "OPENAI-KEY2", "FUNCTION-HOST-KEY", "ivr-from-env", valueOf("jwt-secret")!]) {
      expect(output).not.toContain(secret);
    }
  });

  it("keeps generated secrets that already exist in Key Vault (no surprise sign-out)", () => {
    const res = run("secrets", writeEnv({ IVR_API_KEY: "x" }), "jwt-secret ivr-writeback-key");
    expect(res.status, res.stderr).toBe(0);
    expect(valueOf("jwt-secret")).toBeUndefined();
    expect(valueOf("ivr-writeback-key")).toBeUndefined();
    expect(res.stdout).toContain("jwt-secret: already in Key Vault, kept");
    expect(setCalls()).toHaveLength(5);
  });

  it("uses a value from .env.prod over any lookup", () => {
    const res = run("secrets", writeEnv({ IVR_API_KEY: "x", COSMOS_KEY: "explicit-cosmos" }));
    expect(res.status, res.stderr).toBe(0);
    expect(valueOf("cosmos-key")).toBe("explicit-cosmos");
    expect(calls()).not.toContainEqual(expect.stringContaining("cosmosdb keys list"));
  });

  it("fails clearly when IVR_API_KEY is missing and not in Key Vault", () => {
    const res = run("secrets", writeEnv());
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("IVR_API_KEY is empty");
  });

  it("rejects a JWT secret shorter than 32 characters", () => {
    const res = run("secrets", writeEnv({ IVR_API_KEY: "x", PACCA_JWT_SECRET: "short" }));
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("at least 32 characters");
  });
});

describe("prod-config.sh apply", () => {
  it("adds 7 Key Vault references via the identity, then sets plain + secretref env vars", () => {
    const res = run("apply", writeEnv());
    expect(res.status, res.stderr).toBe(0);

    const secretSet = calls().find((c) => c.startsWith("CALL containerapp secret set"))!;
    expect(secretSet).toContain("-g pacca-idp-rg -n ca-pacca-idp-web");
    expect(secretSet.match(/keyvaultref:/g)).toHaveLength(7);
    expect(secretSet).toContain(
      "jwt-secret=keyvaultref:https://kv-pacca-idp-web.vault.azure.net/secrets/jwt-secret,identityref:/subscriptions/s/resourceGroups/pacca-idp-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-pacca-idp-web"
    );

    const update = calls().find((c) => c.startsWith("CALL containerapp update"))!;
    expect(update).toContain("PACCA_JWT_SECRET=secretref:jwt-secret");
    expect(update).toContain("COSMOS_KEY=secretref:cosmos-key");
    expect(update).toContain("AZURE_FILES_SHARE_NAME=senderra-idp-share");
    expect(update).toContain("COSMOS_ENDPOINT=https://cosmos-senderra-idp.documents.azure.com:443/");
    expect(update.match(/=secretref:/g)).toHaveLength(7);
    // 15 plain settings from env.prod.example + 7 secret refs.
    expect(update.replace(/^.*--set-env-vars /, "").replace(/ -o none$/, "").split(" ")).toHaveLength(22);

    // Secret references come before the env vars that use them.
    expect(calls().indexOf(secretSet)).toBeLessThan(calls().indexOf(update));
  });

  // Regression: a secret changed only in Key Vault (a new IVR key) left the running revision on
  // the old value, because an update with identical settings creates no revision.
  it("restarts the revision when no setting changed, so Key Vault secrets reload", () => {
    const res = run("apply", writeEnv());
    expect(res.status, res.stderr).toBe(0);
    const restart = calls().find((c) => c.startsWith("CALL containerapp revision restart"));
    expect(restart).toContain("-g pacca-idp-rg -n ca-pacca-idp-web --revision app--rev-1");
    expect(calls().indexOf(restart!)).toBeGreaterThan(calls().findIndex((c) => c.startsWith("CALL containerapp update")));
    expect(res.stdout).toContain("No setting changed");
  });

  it("does not restart when the update created a new revision", () => {
    const res = run("apply", writeEnv(), "", { FAKE_NEW_REVISION: "1" });
    expect(res.status, res.stderr).toBe(0);
    expect(calls().some((c) => c.startsWith("CALL containerapp revision restart"))).toBe(false);
    expect(res.stdout).toContain("New revision app--rev-2");
  });
});

describe("env.prod.example", () => {
  it("is tracked and holds no secret values", () => {
    const text = fs.readFileSync(path.join(ROOT, "env.prod.example"), "utf8");
    for (const v of ["COSMOS_KEY", "AZURE_STORAGE_KEY", "OPENAI_API_KEY", "SENDERRA_FUNCTION_KEY", "IVR_API_KEY", "IVR_WRITEBACK_API_KEY", "PACCA_JWT_SECRET"]) {
      expect(text).toMatch(new RegExp(`^${v}=$`, "m"));
    }
    expect(() => execFileSync("git", ["check-ignore", "-q", "env.prod.example"], { cwd: ROOT })).toThrow();
    execFileSync("git", ["check-ignore", "-q", ".env.prod"], { cwd: ROOT }); // ignored -> exit 0
  });
});
