// See packages/next/pages/api/hub.ts

import { conat } from "@cocalc/backend/conat";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import callHub from "@cocalc/conat/hub/call-hub";

let client: ConatClient | null = null;
export default async function hubBridge({
  account_id,
  name,
  args,
  timeout,
}: {
  account_id: string;
  name: string;
  args?: any[];
  timeout?: number;
}) {
  client ??= conat();
  return await callHub({ client, account_id, name, args, timeout });
}
