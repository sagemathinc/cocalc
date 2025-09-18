// sync-state.ts
/*
Reconcile Mutagen sync/forward sessions to match an exact desired state.

Assumptions:
- Mutagen CLI is installed and on PATH.
- Security is not a concern here; we just make the state match exactly.
- We only compare endpoints (alpha/beta for sync; source/destination for forward)
  and the literal flag sets (order-insensitive).

Notes:
- We use Mutagen's --template to produce tab-separated machine-friendly output.
- We compare by canonical keys that include endpoints + sorted flags.
- We do NOT try to "update" existing sessions to adjust flags; we terminate and recreate
  to avoid edge cases in partial updates.
*/

import type { Sync, Forward } from "@cocalc/conat/project/runner/types";
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(_execFile);

/* ---------------------------- helpers & types ---------------------------- */

type CurrentSync = {
  id: string;
  alpha: string;
  beta: string;
  // We don't get flags back; we only match endpoints for existing sessions.
  // Flags are only used for create commands & identity keying on the desired side.
};

type CurrentForward = {
  id: string;
  source: string;
  destination: string;
};

function canonEndpoint(s: string): string {
  // Normalize minor textual differences so comparisons are stable.
  // Keep it simple: trim spaces, collapse multiple slashes in file paths, remove trailing slashes on ssh-like URLs.
  let x = s.trim();

  // Remove trailing slash unless it's just "/" or a protocol root like "ssh://host/"
  if (x.length > 1 && x.endsWith("/")) {
    x = x.replace(/\/+$/g, "");
  }

  // Collapse repeated slashes in file paths (but avoid clobbering URL schemes like "ssh://")
  if (!x.includes("://")) {
    x = x.replace(/\/{2,}/g, "/");
  }

  return x;
}

function canonFlags(flags?: string[]): string[] {
  // Mutagen flags are CLI args (e.g., ["--ignore-vcs", "--sync-mode=two-way-safe"])
  // Sort and dedupe for a canonical key; we treat flags as an unordered set.
  const f = (flags ?? []).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const v of f) seen.add(v);
  return Array.from(seen).sort();
}

// A canonical key for desired syncs/forwards so we can compare sets cleanly.
function keySync(s: Sync): string {
  const a = canonEndpoint(s.alpha);
  const b = canonEndpoint(s.beta);
  const flags = canonFlags(s.flags).join("\u0001"); // unlikely separator
  return `sync|${a}|${b}|${flags}`;
}

function keyForward(fw: Forward): string {
  const s = canonEndpoint(fw.source);
  const d = canonEndpoint(fw.destination);
  const flags = canonFlags(fw.flags).join("\u0001");
  return `fwd|${s}|${d}|${flags}`;
}

// Because Mutagen doesn't expose "flags used to create", we match existing sessions
// by endpoints only; we then enforce exactness by terminating and recreating if flags differ.
function keySyncByEndpointsOnly(alpha: string, beta: string): string {
  return `sync|${canonEndpoint(alpha)}|${canonEndpoint(beta)}`;
}
function keyForwardByEndpointsOnly(
  source: string,
  destination: string,
): string {
  return `fwd|${canonEndpoint(source)}|${canonEndpoint(destination)}`;
}

async function runMutagen(args: string[]): Promise<string> {
  const { stdout } = await execFile("mutagen", args, { encoding: "utf8" });
  return stdout;
}

/* ----------------------------- list functions ---------------------------- */

// We use Go templates to produce stable tab-separated records.
// Fields used:
//   Sync:       .Identifier, .Alpha.URL, .Beta.URL
//   Forward:    .Identifier, .Source.URL, .Destination.URL
//
// The `--template` root for list commands is a slice of sessions, so we `range` it.
const SYNC_LIST_TEMPLATE =
  "{{- range . -}}{{ .Identifier }}\t{{ .Alpha.URL }}\t{{ .Beta.URL }}\n{{- end -}}";
const FWD_LIST_TEMPLATE =
  "{{- range . -}}{{ .Identifier }}\t{{ .Source.URL }}\t{{ .Destination.URL }}\n{{- end -}}";

async function listCurrentSyncs(): Promise<CurrentSync[]> {
  const out = await runMutagen([
    "sync",
    "list",
    "--template",
    SYNC_LIST_TEMPLATE,
  ]);
  const lines = out.trim() === "" ? [] : out.trim().split("\n");
  const results: CurrentSync[] = [];
  for (const line of lines) {
    const [id, alpha, beta] = line.split("\t");
    if (id && alpha && beta) {
      results.push({ id, alpha: alpha.trim(), beta: beta.trim() });
    }
  }
  return results;
}

async function listCurrentForwards(): Promise<CurrentForward[]> {
  const out = await runMutagen([
    "forward",
    "list",
    "--template",
    FWD_LIST_TEMPLATE,
  ]);
  const lines = out.trim() === "" ? [] : out.trim().split("\n");
  const results: CurrentForward[] = [];
  for (const line of lines) {
    const [id, source, destination] = line.split("\t");
    if (id && source && destination) {
      results.push({
        id,
        source: source.trim(),
        destination: destination.trim(),
      });
    }
  }
  return results;
}

/* ----------------------------- reconcile core ---------------------------- */

type Action =
  | { kind: "create-sync"; spec: Sync }
  | { kind: "terminate-sync"; id: string; alpha: string; beta: string }
  | { kind: "create-forward"; spec: Forward }
  | {
      kind: "terminate-forward";
      id: string;
      source: string;
      destination: string;
    };

function planSyncActions(desired: Sync[], current: CurrentSync[]): Action[] {
  const actions: Action[] = [];

  // Build desired maps
  const desiredByEndpoint = new Map<string, Sync[]>();
  const desiredKeyToSpec = new Map<string, Sync>();
  for (const s of desired) {
    const byEp = keySyncByEndpointsOnly(s.alpha, s.beta);
    const fullK = keySync(s);
    desiredKeyToSpec.set(fullK, s);
    const arr = desiredByEndpoint.get(byEp) ?? [];
    arr.push(s);
    desiredByEndpoint.set(byEp, arr);
  }

  // Terminate anything whose endpoints don't appear in desired at all.
  const desiredEndpointKeys = new Set(desiredByEndpoint.keys());
  for (const c of current) {
    const k = keySyncByEndpointsOnly(c.alpha, c.beta);
    if (!desiredEndpointKeys.has(k)) {
      actions.push({
        kind: "terminate-sync",
        id: c.id,
        alpha: c.alpha,
        beta: c.beta,
      });
    }
  }

  // Create anything missing (by endpoints+flags).
  // Since existing sessions don't expose "flags used", we adopt a strict stance:
  // - If there is ANY existing session for the same endpoints, we keep exactly one
  //   *only if* desired has exactly one variant. Otherwise we terminate all and recreate
  //   precisely as desired (unique variants allowed via different flags).
  //
  // This ensures exact match and avoids ghost sessions or wrong-flag sessions.
  const existingByEndpoint = new Map<string, CurrentSync[]>();
  for (const c of current) {
    const k = keySyncByEndpointsOnly(c.alpha, c.beta);
    const arr = existingByEndpoint.get(k) ?? [];
    arr.push(c);
    existingByEndpoint.set(k, arr);
  }

  for (const [byEpKey, desiredVariants] of desiredByEndpoint.entries()) {
    const existingVariants = existingByEndpoint.get(byEpKey) ?? [];

    // If counts differ or >1 desired variants, enforce exactness by clearing and recreating.
    // (Mutagen doesn't support multiple sessions with identical endpoints unless names differ,
    //  but flags may differ; we take the simple "recreate" approach for exactness.)
    const needFullReplace =
      existingVariants.length !== desiredVariants.length ||
      desiredVariants.length !== 1;

    if (needFullReplace) {
      for (const ex of existingVariants) {
        actions.push({
          kind: "terminate-sync",
          id: ex.id,
          alpha: ex.alpha,
          beta: ex.beta,
        });
      }
      for (const spec of desiredVariants) {
        actions.push({ kind: "create-sync", spec });
      }
      continue;
    }

    // One desired, one existing → ensure flags match by replacing if necessary.
    const [spec] = desiredVariants;
    // We can’t read current flags, so we *always* recreate to guarantee exactness.
    for (const ex of existingVariants) {
      actions.push({
        kind: "terminate-sync",
        id: ex.id,
        alpha: ex.alpha,
        beta: ex.beta,
      });
    }
    actions.push({ kind: "create-sync", spec });
  }

  // Also, if there are desired entries whose endpoints have *no* existing session, create them:
  for (const s of desired) {
    const k = keySyncByEndpointsOnly(s.alpha, s.beta);
    if (!existingByEndpoint.get(k)?.length) {
      // Avoid double-creating if we already planned it via "needFullReplace" above:
      const alreadyPlanned = actions.some(
        (a) =>
          a.kind === "create-sync" &&
          a.spec.alpha === s.alpha &&
          a.spec.beta === s.beta,
      );
      if (!alreadyPlanned) actions.push({ kind: "create-sync", spec: s });
    }
  }

  // Finally, terminate any leftover existing sessions that share endpoints with desired but were not handled.
  // (Safety net—should be redundant.)
  const handledTerminations = new Set(
    actions
      .filter((a) => a.kind === "terminate-sync")
      .map((a) => (a as any as { id: string }).id),
  );
  for (const c of current) {
    if (!handledTerminations.has(c.id)) {
      const byEp = keySyncByEndpointsOnly(c.alpha, c.beta);
      if (desiredByEndpoint.has(byEp)) {
        // If we got here, we likely missed a replace; terminate to enforce exactness.
        actions.push({
          kind: "terminate-sync",
          id: c.id,
          alpha: c.alpha,
          beta: c.beta,
        });
      }
    }
  }

  return dedupeActions(actions);
}

function planForwardActions(
  desired: Forward[],
  current: CurrentForward[],
): Action[] {
  const actions: Action[] = [];

  const desiredByEndpoint = new Map<string, Forward[]>();
  for (const f of desired) {
    const k = keyForwardByEndpointsOnly(f.source, f.destination);
    const arr = desiredByEndpoint.get(k) ?? [];
    arr.push(f);
    desiredByEndpoint.set(k, arr);
  }

  const desiredEndpointKeys = new Set(desiredByEndpoint.keys());
  for (const c of current) {
    const k = keyForwardByEndpointsOnly(c.source, c.destination);
    if (!desiredEndpointKeys.has(k)) {
      actions.push({
        kind: "terminate-forward",
        id: c.id,
        source: c.source,
        destination: c.destination,
      });
    }
  }

  const existingByEndpoint = new Map<string, CurrentForward[]>();
  for (const c of current) {
    const k = keyForwardByEndpointsOnly(c.source, c.destination);
    const arr = existingByEndpoint.get(k) ?? [];
    arr.push(c);
    existingByEndpoint.set(k, arr);
  }

  for (const [byEpKey, desiredVariants] of desiredByEndpoint.entries()) {
    const existingVariants = existingByEndpoint.get(byEpKey) ?? [];

    const needFullReplace =
      existingVariants.length !== desiredVariants.length ||
      desiredVariants.length !== 1;

    if (needFullReplace) {
      for (const ex of existingVariants) {
        actions.push({
          kind: "terminate-forward",
          id: ex.id,
          source: ex.source,
          destination: ex.destination,
        });
      }
      for (const spec of desiredVariants) {
        actions.push({ kind: "create-forward", spec });
      }
      continue;
    }

    // One desired, one existing → recreate to enforce exact flags.
    for (const ex of existingVariants) {
      actions.push({
        kind: "terminate-forward",
        id: ex.id,
        source: ex.source,
        destination: ex.destination,
      });
    }
    actions.push({ kind: "create-forward", spec: desiredVariants[0] });
  }

  for (const f of desired) {
    const k = keyForwardByEndpointsOnly(f.source, f.destination);
    if (!existingByEndpoint.get(k)?.length) {
      const alreadyPlanned = actions.some(
        (a) =>
          a.kind === "create-forward" &&
          (a as any as { spec: Forward }).spec.source === f.source &&
          (a as any as { spec: Forward }).spec.destination === f.destination,
      );
      if (!alreadyPlanned) actions.push({ kind: "create-forward", spec: f });
    }
  }

  const handledTerminations = new Set(
    actions
      .filter((a) => a.kind === "terminate-forward")
      .map((a) => (a as any as { id: string }).id),
  );
  for (const c of current) {
    if (!handledTerminations.has(c.id)) {
      const byEp = keyForwardByEndpointsOnly(c.source, c.destination);
      if (desiredByEndpoint.has(byEp)) {
        actions.push({
          kind: "terminate-forward",
          id: c.id,
          source: c.source,
          destination: c.destination,
        });
      }
    }
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: Action[]): Action[] {
  // Avoid accidental duplicates.
  const seen = new Set<string>();
  const out: Action[] = [];
  for (const a of actions) {
    const k =
      a.kind === "create-sync"
        ? `cs|${keySync(a.spec)}`
        : a.kind === "create-forward"
          ? `cf|${keyForward(a.spec)}`
          : a.kind === "terminate-sync"
            ? `ts|${a.id}`
            : `tf|${a.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(a);
    }
  }
  return out;
}

/* ----------------------------- execution layer ---------------------------- */

async function terminateSync(id: string): Promise<void> {
  await runMutagen(["sync", "terminate", id]);
}

async function createSync(spec: Sync): Promise<void> {
  const args = [
    "sync",
    "create",
    ...canonFlags(spec.flags),
    spec.alpha,
    spec.beta,
  ];
  await runMutagen(args);
}

async function terminateForward(id: string): Promise<void> {
  await runMutagen(["forward", "terminate", id]);
}

async function createForward(spec: Forward): Promise<void> {
  const args = [
    "forward",
    "create",
    ...canonFlags(spec.flags),
    spec.source,
    spec.destination,
  ];
  await runMutagen(args);
}

/* --------------------------------- public -------------------------------- */

export type SyncStateResult = {
  terminatedSyncs: { id: string; alpha: string; beta: string }[];
  createdSyncs: Sync[];
  terminatedForwards: { id: string; source: string; destination: string }[];
  createdForwards: Forward[];
};

export async function syncState({
  sync: desiredSyncs,
  forward: desiredForwards,
}: {
  sync: Sync[];
  forward: Forward[];
}): Promise<SyncStateResult> {
  const [currentSyncs, currentForwards] = await Promise.all([
    listCurrentSyncs(),
    listCurrentForwards(),
  ]);

  const syncActions = planSyncActions(desiredSyncs, currentSyncs);
  const forwardActions = planForwardActions(desiredForwards, currentForwards);

  const terminatedSyncs: SyncStateResult["terminatedSyncs"] = [];
  const createdSyncs: SyncStateResult["createdSyncs"] = [];
  const terminatedForwards: SyncStateResult["terminatedForwards"] = [];
  const createdForwards: SyncStateResult["createdForwards"] = [];

  // Execute in a deterministic order: terminate first, then create.
  for (const a of [...syncActions, ...forwardActions]) {
    if (a.kind === "terminate-sync") {
      await terminateSync(a.id);
      terminatedSyncs.push({ id: a.id, alpha: a.alpha, beta: a.beta });
    }
    if (a.kind === "terminate-forward") {
      await terminateForward(a.id);
      terminatedForwards.push({
        id: a.id,
        source: a.source,
        destination: a.destination,
      });
    }
  }
  for (const a of [...syncActions, ...forwardActions]) {
    if (a.kind === "create-sync") {
      await createSync(a.spec);
      createdSyncs.push(a.spec);
    }
    if (a.kind === "create-forward") {
      await createForward(a.spec);
      createdForwards.push(a.spec);
    }
  }

  return { terminatedSyncs, createdSyncs, terminatedForwards, createdForwards };
}
