import { conat } from "@cocalc/backend/conat";
import { lroStreamName } from "@cocalc/conat/lro/names";
import type {
  LroEvent,
  LroScopeType,
  LroSummary,
} from "@cocalc/conat/hub/api/lro";

const DEFAULT_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

function scopeArgs(scope_type: LroScopeType, scope_id: string) {
  if (scope_type === "project") {
    return { project_id: scope_id };
  }
  if (scope_type === "account") {
    return { account_id: scope_id };
  }
  if (scope_type === "host") {
    return { host_id: scope_id };
  }
  return {};
}

export async function publishLroEvent({
  scope_type,
  scope_id,
  op_id,
  event,
  ttl = DEFAULT_EVENT_TTL_MS,
}: {
  scope_type: LroScopeType;
  scope_id: string;
  op_id: string;
  event: LroEvent;
  ttl?: number;
}): Promise<void> {
  const client = await conat();
  const stream = client.sync.astream<LroEvent>({
    ...scopeArgs(scope_type, scope_id),
    name: lroStreamName(op_id),
  });
  await stream.publish(event, { ttl });
}

export async function publishLroSummary({
  scope_type,
  scope_id,
  summary,
}: {
  scope_type: LroScopeType;
  scope_id: string;
  summary: LroSummary;
}): Promise<void> {
  await publishLroEvent({
    scope_type,
    scope_id,
    op_id: summary.op_id,
    event: {
      type: "summary",
      ts: Date.now(),
      summary,
    },
  });
}
