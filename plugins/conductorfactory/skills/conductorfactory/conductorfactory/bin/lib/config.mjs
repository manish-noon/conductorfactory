// Loads the factory settings: config.default.json in this folder, deep-merged with
// the repository's own conductorfactory/config.json. Fails loudly on a missing or
// malformed key so a typo never runs silently.
//
// The Factory home is the checkout whose conductorfactory/ folder every session
// uses: $FACTORY_HOME (set by conductorfactory/run), else the repository you run from.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const FACTORY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.cwd();
  }
}

export const FACTORY_HOME = process.env.FACTORY_HOME ?? repoRoot();
// A short id for this Factory home, recorded with each run so one login's
// second Factory home (another worktree or machine) is recognised.
export const HOME_ID = createHash("sha1").update(`${hostname()}:${FACTORY_HOME}`).digest("hex").slice(0, 8);
export const CONFIG_PATH = join(FACTORY_HOME, "conductorfactory", "config.json");
const DEFAULT_PATH = join(FACTORY_DIR, "config.default.json");

const REQUIRED = [
  "limits.maxActive", "limits.maxRounds", "limits.maxVerifiers", "limits.maxNudges",
  "limits.maxStatusResets", "limits.maxEvidenceFiles", "limits.maxAdvice", "limits.workspaceCreateRetries",
  "watcher.pollSeconds", "watcher.heartbeatMinutes", "watcher.digestHour",
  "git.branchPrefix", "sessions.agent", "sessions.model",
  "identity.commitTrailer", "identity.commentPrefix", "identity.coordinatorMark",
  "conductor.section",
  "github.queueLabel", "github.pauseLabel", "github.needsHumanLabel", "github.sizeLabelPrefix",
  "github.outcomeLabels.autonomous", "github.outcomeLabels.assisted", "github.mergeMethod",
  "github.claimFor", "github.handoverWaitMinutes",
  "evidence.attach", "phases", "sizes", "prices",
];

export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObject(v) && isObject(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

function validate(cfg) {
  const missing = REQUIRED.filter((p) => getPath(cfg, p) == null);
  if (missing.length) throw new Error(`${CONFIG_PATH}: missing ${missing.join(", ")}`);
  for (const [phase, p] of Object.entries(cfg.phases)) {
    if (typeof p.label !== "string" || !("status" in p)) {
      throw new Error(`${CONFIG_PATH}: phases.${phase} needs a label and a status (null to leave the labels alone)`);
    }
  }
  return cfg;
}

function load() {
  const defaults = JSON.parse(readFileSync(DEFAULT_PATH, "utf8"));
  const own = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : {};
  return validate(deepMerge(defaults, own));
}

export const config = load();

const phaseSet = (flag) => new Set(Object.entries(config.phases).filter(([, p]) => p[flag]).map(([k]) => k));

export const PHASES = new Set(Object.keys(config.phases));
export const ACTIVE_PHASES = phaseSet("active");
export const FINAL_PHASES = phaseSet("final");
export const WAITING_ON_HUMAN_PHASES = phaseSet("waitingOnHuman");

// The issue label a phase should show, or null when the factory leaves the labels alone.
export const expectedStatus = (phase) => config.phases[phase]?.status ?? null;

// Every label that says where an issue is in the factory. Exactly one is on a tracked issue.
export const STATUS_LABELS = new Set(
  [config.github.queueLabel, config.github.pauseLabel, ...Object.values(config.phases).map((p) => p.status)].filter(Boolean),
);
