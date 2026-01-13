/*

Maybe storage available as a service.

This code is similar to the changefeed server, because
it provides a changefeed on a given persist storage,
and a way to see values.

DEVELOPMENT:

Change to the packages/backend directory and run node.

TERMINAL 1: This sets up the environment and starts the server running:

   require('@cocalc/backend/conat/persist').initServer()


TERMINAL 2: In another node session, create a client:

    user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {id, stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage}); console.log({id}); for await(const x of stream) { console.log(x.data) }; console.log("DONE")

// client also does this periodically to keep subscription alive:

    await renew({user, id })

TERMINAL 3:

user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {set,get} = require('@cocalc/backend/conat/persist');  const { messageData } =require("@cocalc/conat/core/client"); 0;

   await set({user, storage, messageData:messageData('hi')})

   await get({user, storage,  seq:1})

   await set({user, storage, key:'bella', messageData:messageData('hi', {headers:{x:10}})})

   await get({user, storage,  key:'bella'})

Also getAll using start_seq:

   cf = const {id,  stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage, start_seq:10}); for await(const x of stream) { console.log(x) };
*/

import { assertHasWritePermission } from "./auth";
import { pstream, PersistentStream } from "./storage";
import { join } from "path";
import { syncFiles, ensureContainingDirectoryExists, statSync } from "./context";

// this is per-server -- and "user" means where the resource is, usually
// a given project.  E.g., 500 streams in a project, across many users.
export const MAX_PER_USER = 500;
export const MAX_GLOBAL = 10000;
export const RESOURCE = "persistent storage";

//import { getLogger } from "@cocalc/conat/client";
//const logger = getLogger("persist:util");

export const SERVICE = "persist";

export type User = {
  account_id?: string;
  project_id?: string;
  hub_id?: string;
  host_id?: string;
};

function resolveTemplateBase(base: string, token: string, id: string): string {
  const placeholder = `[${token}]`;
  if (base.includes(placeholder)) {
    return base.split(placeholder).join(id);
  }
  return join(base, id);
}

function resolveLocalPath(storagePath: string): string {
  const projectMatch = storagePath.match(/^projects\/([^/]+)(?:\/(.*))?$/);
  if (projectMatch) {
    const [, projectId, rest = ""] = projectMatch;
    if (syncFiles.localProjects) {
      const template = syncFiles.localProjects;
      const base = resolveTemplateBase(template, "project_id", projectId);
      const projectRoot = template.includes("[project_id]")
        ? (() => {
            const [prefix, suffix] = template.split("[project_id]");
            const suffixRoot = suffix.split("/")[0] ?? "";
            return `${prefix}${projectId}${suffixRoot}`;
          })()
        : base;
      try {
        statSync(projectRoot);
      } catch {
        throw new Error(`project root does not exist: ${projectRoot}`);
      }
      return rest ? join(base, rest) : base;
    }
  }

  const accountMatch = storagePath.match(/^accounts\/([^/]+)(?:\/(.*))?$/);
  if (accountMatch) {
    const [, accountId, rest = ""] = accountMatch;
    if (syncFiles.localAccounts) {
      const base = resolveTemplateBase(
        syncFiles.localAccounts,
        "account_id",
        accountId,
      );
      return rest ? join(base, rest) : base;
    }
  }

  const hostMatch = storagePath.match(/^hosts\/([^/]+)(?:\/(.*))?$/);
  if (hostMatch) {
    const [, hostId, rest = ""] = hostMatch;
    if (syncFiles.localHosts) {
      const base = resolveTemplateBase(
        syncFiles.localHosts,
        "host_id",
        hostId,
      );
      return rest ? join(base, rest) : base;
    }
  }

  if (storagePath.startsWith("hub/") && syncFiles.localHub) {
    const rest = storagePath.slice("hub/".length);
    return rest ? join(syncFiles.localHub, rest) : syncFiles.localHub;
  }

  return join(syncFiles.local, storagePath);
}

export function persistSubject({
  account_id,
  project_id,
  host_id,
  service = SERVICE,
}: User & { service?: string }) {
  if (account_id) {
    return `${service}.account-${account_id}`;
  } else if (project_id) {
    return `${service}.project-${project_id}`;
  } else if (host_id) {
    return `${service}.host-${host_id}`;
  } else {
    return `${service}.hub`;
  }
}

export async function getStream({
  subject,
  storage,
  service,
}): Promise<PersistentStream> {
  // this permsissions check should always work and use should
  // never see an error here, since
  // the same check runs on the client before the message is sent to the
  // persist storage.  However a malicious user would hit this.
  // IMPORTANT: must be here so error *code* also sent back.
  assertHasWritePermission({
    subject,
    path: storage.path,
    service,
  });
  // Project/host/account paths can be redirected to per-subject roots.
  const path = resolveLocalPath(storage.path);
  const archive = syncFiles.archive
    ? join(syncFiles.archive, storage.path)
    : undefined;
  const backup = syncFiles.backup
    ? join(syncFiles.backup, storage.path)
    : undefined;
  const archiveInterval = syncFiles.archiveInterval;
  await Promise.all(
    [path, archive, backup]
      .filter((x) => x)
      .map(ensureContainingDirectoryExists),
  );
  return pstream({ ...storage, path, archive, backup, archiveInterval });
}
