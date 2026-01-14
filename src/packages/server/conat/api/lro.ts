import getPool from "@cocalc/database/pool";
import type { LroScopeType, LroSummary } from "@cocalc/conat/hub/api/lro";
import { assertCollab } from "./util";
import { getLro, listLro, updateLro } from "@cocalc/server/lro/lro-db";

async function assertScopeAccess({
  account_id,
  scope_type,
  scope_id,
}: {
  account_id?: string;
  scope_type: LroScopeType;
  scope_id: string;
}) {
  if (scope_type === "project") {
    await assertCollab({ account_id, project_id: scope_id });
    return;
  }
  if (!account_id) {
    throw new Error("must be signed in");
  }
  if (scope_type === "account") {
    if (account_id !== scope_id) {
      throw new Error("not authorized");
    }
    return;
  }
  if (scope_type === "host") {
    const { rows } = await getPool().query(
      "SELECT metadata FROM project_hosts WHERE id=$1 AND deleted IS NULL",
      [scope_id],
    );
    if (!rows[0]) {
      throw new Error("not authorized");
    }
    const metadata = rows[0].metadata ?? {};
    const isOwner = metadata.owner === account_id;
    const collabs: string[] = metadata.collaborators ?? [];
    if (isOwner || collabs.includes(account_id)) {
      return;
    }
    throw new Error("not authorized");
  }
  throw new Error("unsupported scope");
}

export async function get({
  account_id,
  op_id,
}: {
  account_id?: string;
  op_id: string;
}): Promise<LroSummary | undefined> {
  const row = await getLro(op_id);
  if (!row) return undefined;
  await assertScopeAccess({
    account_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
  });
  return row;
}

export async function list({
  account_id,
  scope_type,
  scope_id,
  include_completed,
}: {
  account_id?: string;
  scope_type: LroScopeType;
  scope_id: string;
  include_completed?: boolean;
}): Promise<LroSummary[]> {
  await assertScopeAccess({ account_id, scope_type, scope_id });
  return await listLro({ scope_type, scope_id, include_completed });
}

export async function cancel({
  account_id,
  op_id,
}: {
  account_id?: string;
  op_id: string;
}): Promise<void> {
  const row = await getLro(op_id);
  if (!row) return;
  await assertScopeAccess({
    account_id,
    scope_type: row.scope_type,
    scope_id: row.scope_id,
  });
  await updateLro({
    op_id,
    status: "canceled",
    error: row.error ?? "canceled",
  });
}
