import { createHmac } from "node:crypto";

import type {
  PublishedShare,
  SharePublishResult,
  ShareScope,
  ShareViewerToken,
} from "@cocalc/conat/hub/api/shares";
import { lroStreamName } from "@cocalc/conat/lro/names";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";
import getPool from "@cocalc/database/pool";
import { createLro } from "@cocalc/server/lro/lro-db";
import {
  getPublishedShareById,
  listPublishedSharesByProject,
  updatePublishedShare,
  updatePublishedSharePublishStatus,
  upsertPublishedShare,
} from "@cocalc/server/shares/db";
import { resolveShareJwtSecret } from "@cocalc/server/shares/jwt";
import { ensureShareWorkerProvisioned } from "@cocalc/server/shares/worker-provision";

import { assertCollab } from "./util";

const SHARE_PUBLISH_LRO_KIND = "share-publish";
const VALID_SCOPES = new Set<ShareScope>([
  "public",
  "unlisted",
  "authenticated",
  "org",
]);
const DEFAULT_SHARE_JWT_TTL_SECONDS = 15 * 60;
const DEFAULT_SHARE_JWT_AUDIENCE = "cocalc-share";

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
  ensureShareWorkerProvisioned({ reason: "publish" }).catch(() => undefined);
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

export async function viewerToken({
  account_id,
  share_id,
}: {
  account_id?: string;
  share_id: string;
}): Promise<ShareViewerToken | null> {
  if (!account_id) {
    throw new Error("must be signed in");
  }
  const share = await getPublishedShareById(share_id);
  if (!share) {
    throw new Error("share not found");
  }
  if (share.scope === "public" || share.scope === "unlisted") {
    return null;
  }
  if (share.scope === "org") {
    if (!share.org_id) {
      throw new Error("org_id is required for org scope shares");
    }
    const allowed = await accountIsInOrganization({
      account_id,
      org_id: share.org_id,
    });
    if (!allowed) {
      throw new Error("not authorized to view this share");
    }
  }
  return await createShareViewerToken({ share, account_id });
}

async function accountIsInOrganization({
  account_id,
  org_id,
}: {
  account_id: string;
  org_id: string;
}): Promise<boolean> {
  const { rows } = await getPool().query<{ ok: number }>(
    `
      SELECT 1 AS ok
      FROM organizations o
      JOIN accounts a ON a.org = o.name
      WHERE o.organization_id=$1 AND a.account_id=$2
      LIMIT 1
    `,
    [org_id, account_id],
  );
  return rows.length > 0;
}

async function createShareViewerToken({
  share,
  account_id,
}: {
  share: PublishedShare;
  account_id: string;
}): Promise<ShareViewerToken> {
  const secret = await resolveShareJwtSecret();
  const ttlSeconds =
    Number(process.env.SHARE_JWT_TTL_SECONDS) || DEFAULT_SHARE_JWT_TTL_SECONDS;
  const audience = process.env.SHARE_JWT_AUDIENCE ?? DEFAULT_SHARE_JWT_AUDIENCE;
  const issuer = process.env.SHARE_JWT_ISSUER;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const payload: Record<string, unknown> = {
    aud: audience,
    sub: account_id,
    share_id: share.share_id,
    scope: share.scope,
    iat: now,
    exp,
  };
  if (issuer) {
    payload.iss = issuer;
  }
  if (share.scope === "org" && share.org_id) {
    payload.org_id = share.org_id;
  }

  const token = signJwt({ payload, secret });
  return { token, expires_at: exp };
}

function signJwt({
  payload,
  secret,
}: {
  payload: Record<string, unknown>;
  secret: string;
}): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64Url(JSON.stringify(header));
  const payloadB64 = base64Url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const signature = createHmac("sha256", secret).update(data).digest();
  return `${data}.${base64Url(signature)}`;
}

function base64Url(input: string | Buffer): string {
  const base64 =
    typeof input === "string"
      ? Buffer.from(input).toString("base64")
      : input.toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
