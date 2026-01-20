import { lroStreamName } from "@cocalc/conat/lro/names";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";
import type {
  PublishedShare,
  SharePublishResult,
  ShareScope,
} from "@cocalc/conat/hub/api/shares";
import { createLro } from "@cocalc/server/lro/lro-db";
import {
  getPublishedShareById,
  listPublishedSharesByProject,
  updatePublishedShare,
  updatePublishedSharePublishStatus,
  upsertPublishedShare,
} from "@cocalc/server/shares/db";
import { assertCollab } from "./util";

const SHARE_PUBLISH_LRO_KIND = "share-publish";
const VALID_SCOPES = new Set<ShareScope>([
  "public",
  "unlisted",
  "authenticated",
  "org",
]);

function normalizeScope({
  scope,
  org_id,
}: {
  scope: ShareScope;
  org_id?: string | null;
}): { scope: ShareScope; org_id: string | null } {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error(`unsupported share scope: ${scope}`);
  }
  if (scope === "org") {
    if (!org_id) {
      throw new Error("org_id is required for org scope shares");
    }
    return { scope, org_id };
  }
  return { scope, org_id: null };
}

function validatePath(path: string): void {
  if (typeof path !== "string") {
    throw new Error("path must be a string");
  }
  if (path.includes("..") || path.startsWith("/")) {
    throw new Error("path must be relative and not include '..'");
  }
}

export async function createShare({
  account_id,
  project_id,
  path,
  scope,
  indexing_opt_in,
  org_id,
}: {
  account_id?: string;
  project_id: string;
  path: string;
  scope: ShareScope;
  indexing_opt_in?: boolean;
  org_id?: string | null;
}): Promise<PublishedShare> {
  await assertCollab({ account_id, project_id });
  validatePath(path);
  const normalized = normalizeScope({ scope, org_id });
  return await upsertPublishedShare({
    project_id,
    path,
    scope: normalized.scope,
    org_id: normalized.org_id,
    indexing_opt_in: indexing_opt_in ?? false,
  });
}

export async function updateShare({
  account_id,
  share_id,
  scope,
  indexing_opt_in,
  org_id,
}: {
  account_id?: string;
  share_id: string;
  scope?: ShareScope;
  indexing_opt_in?: boolean;
  org_id?: string | null;
}): Promise<PublishedShare> {
  const existing = await getPublishedShareById(share_id);
  if (!existing) {
    throw new Error("share not found");
  }
  await assertCollab({ account_id, project_id: existing.project_id });

  let nextScope = existing.scope;
  let nextOrgId = existing.org_id;
  if (scope) {
    const normalized = normalizeScope({ scope, org_id });
    nextScope = normalized.scope;
    nextOrgId = normalized.org_id;
  } else if (org_id !== undefined) {
    if (existing.scope !== "org") {
      throw new Error("org_id can only be set for org scope shares");
    }
    nextOrgId = org_id;
  }
  if (nextScope === "org" && !nextOrgId) {
    throw new Error("org_id is required for org scope shares");
  }

  const nextIndexing = indexing_opt_in ?? existing.indexing_opt_in;
  const updated = await updatePublishedShare({
    share_id,
    scope: nextScope,
    org_id: nextScope === "org" ? nextOrgId : null,
    indexing_opt_in: nextIndexing,
  });
  if (!updated) {
    throw new Error("share not found");
  }
  return updated;
}

export async function getShare({
  account_id,
  share_id,
}: {
  account_id?: string;
  share_id: string;
}): Promise<PublishedShare | undefined> {
  const share = await getPublishedShareById(share_id);
  if (!share) return undefined;
  await assertCollab({ account_id, project_id: share.project_id });
  return share;
}

export async function listShares({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}): Promise<PublishedShare[]> {
  await assertCollab({ account_id, project_id });
  return await listPublishedSharesByProject(project_id);
}

export async function publishShare({
  account_id,
  share_id,
}: {
  account_id?: string;
  share_id: string;
}): Promise<SharePublishResult> {
  const share = await getPublishedShareById(share_id);
  if (!share) {
    throw new Error("share not found");
  }
  await assertCollab({ account_id, project_id: share.project_id });

  const op = await createLro({
    kind: SHARE_PUBLISH_LRO_KIND,
    scope_type: "project",
    scope_id: share.project_id,
    created_by: account_id,
    routing: "hub",
    input: {
      project_id: share.project_id,
      share_id,
      path: share.path,
    },
    status: "queued",
    dedupe_key: `${SHARE_PUBLISH_LRO_KIND}:${share_id}`,
  });

  await updatePublishedSharePublishStatus({
    share_id,
    status: "queued",
    error: null,
  });

  await publishLroSummary({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    summary: op,
  });

  publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: "queued",
      message: "queued",
      progress: 0,
    },
  }).catch(() => {});

  return {
    op_id: op.op_id,
    scope_type: "project",
    scope_id: share.project_id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
  };
}

export async function setIndexing({
  account_id,
  share_id,
  indexing_opt_in,
}: {
  account_id?: string;
  share_id: string;
  indexing_opt_in: boolean;
}): Promise<PublishedShare> {
  const share = await getPublishedShareById(share_id);
  if (!share) {
    throw new Error("share not found");
  }
  await assertCollab({ account_id, project_id: share.project_id });
  const updated = await updatePublishedShare({
    share_id,
    scope: share.scope,
    org_id: share.scope === "org" ? share.org_id : null,
    indexing_opt_in,
  });
  if (!updated) {
    throw new Error("share not found");
  }
  return updated;
}
