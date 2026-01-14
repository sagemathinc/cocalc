import { conat } from "@cocalc/conat/client";
import type { Client } from "@cocalc/conat/core/client";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type { LroEvent, LroScopeType } from "@cocalc/conat/hub/api/lro";
import { isValidUUID } from "@cocalc/util/misc";
import { lroStreamName } from "./names";

type LroLocation = {
  project_id?: string;
  account_id?: string;
  host_id?: string;
};

function scopeLocation({
  scope_type,
  scope_id,
}: {
  scope_type: LroScopeType;
  scope_id?: string;
}): LroLocation {
  if (scope_type === "hub") {
    return {};
  }
  if (!scope_id) {
    throw new Error("scope_id must be set");
  }
  if (!isValidUUID(scope_id)) {
    throw new Error("scope_id must be a valid uuid");
  }
  if (scope_type === "project") {
    return { project_id: scope_id };
  }
  if (scope_type === "account") {
    return { account_id: scope_id };
  }
  if (scope_type === "host") {
    return { host_id: scope_id };
  }
  throw new Error(`unsupported scope_type: ${scope_type}`);
}

export async function get({
  op_id,
  stream_name,
  scope_type,
  scope_id,
  client = conat(),
}: {
  op_id?: string;
  stream_name?: string;
  scope_type: LroScopeType;
  scope_id?: string;
  client?: Client;
}): Promise<DStream<LroEvent>> {
  const name = stream_name ?? (op_id ? lroStreamName(op_id) : "");
  if (!name) {
    throw new Error("op_id or stream_name must be set");
  }
  const location = scopeLocation({ scope_type, scope_id });
  return await client.sync.dstream<LroEvent>({
    ...location,
    name,
  });
}
