/*
Archive inactive things to save on resources.
*/

import { getKvManager, getStreamManager } from "./info";
import "@cocalc/backend/conat";
import { isValidUUID } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import { archiveProject, archiveAccount } from "./archive";

const logger = getLogger("tiered-storage:clean");
const log = (...args) => {
  logger.debug(...args);
  console.log("tiered-storage:clean: ", ...args);
};

const DAY = 1000 * 60 * 60 * 24;

const DEFAULT_DAYS = 7;
const MIN_DAYS = 3;

function ageToTimestamp(days: number) {
  return Date.now() - days * DAY;
}

function isProjectOrAccount(name) {
  if (!(name.startsWith("account-") || name.startsWith("project-"))) {
    return false;
  }
  if (!isValidUUID(name.slice(-36))) {
    return false;
  }
  return true;
}

export async function getOldKvs({
  days = DEFAULT_DAYS,
}: {
  days?: number;
} = {}) {
  const cutoff = ageToTimestamp(days);
  const kvm = await getKvManager();
  const names: string[] = [];
  for await (const { si } of kvm.list()) {
    if (!si.config.name.startsWith("KV_")) {
      continue;
    }
    const name = si.config.name.slice("KV_".length);
    if (!isProjectOrAccount(name)) {
      continue;
    }
    const { last_ts } = si.state;
    const last = last_ts.startsWith("0001") ? 0 : new Date(last_ts).valueOf();
    if (last <= cutoff) {
      names.push(name);
    }
  }
  return names;
}

export async function getOldStreams({
  days = DEFAULT_DAYS,
}: {
  days?: number;
} = {}) {
  const cutoff = ageToTimestamp(days);
  const jsm = await getStreamManager();
  const names: string[] = [];
  for await (const si of jsm.streams.list()) {
    const name = si.config.name;
    if (!isProjectOrAccount(name)) {
      continue;
    }
    if (name.startsWith("KV_")) {
      continue;
    }
    const { last_ts } = si.state;
    const last = last_ts.startsWith("0001") ? 0 : new Date(last_ts).valueOf();
    if (last <= cutoff) {
      names.push(name);
    }
  }
  return names;
}

export async function getOldProjectsAndAccounts({
  days = DEFAULT_DAYS,
}: {
  days?: number;
} = {}) {
  const kvs = await getOldKvs({ days });
  const streams = await getOldStreams({ days });
  const projects = new Set<string>();
  const accounts = new Set<string>();
  for (const kv of kvs.concat(streams)) {
    if (kv.startsWith("account")) {
      accounts.add(kv.slice("account-".length));
    }
    if (kv.startsWith("project")) {
      projects.add(kv.slice("project-".length));
    }
  }
  return {
    accounts: Array.from(accounts).sort(),
    projects: Array.from(projects).sort(),
  };
}

export async function archiveInactive({
  days = DEFAULT_DAYS,
  force = false,
  dryRun = true,
}: {
  days?: number;
  force?: boolean;
  dryRun?: boolean;
} = {}) {
  log("archiveInactive", { days, force, dryRun });
  // step 1 -- get all streams and kv in nats
  if (days < MIN_DAYS && !force) {
    throw Error(`days is < ${MIN_DAYS} day, which is very suspicious!`);
  }

  const { accounts, projects } = await getOldProjectsAndAccounts({ days });
  log(
    `archiveInactive: got ${accounts.length} accounts and ${projects.length} projects`,
  );
  if (dryRun) {
    log(`archiveInactive: dry run so not doing`);
    return;
  }

  for (const account_id of accounts) {
    log(`archiving account ${account_id}`);
    await archiveAccount({ account_id });
  }
  for (const project_id of projects) {
    log(`archiving project ${project_id}`);
    await archiveProject({ project_id });
  }
}
