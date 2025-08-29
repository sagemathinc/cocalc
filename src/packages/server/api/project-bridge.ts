// See packages/next/pages/api/hub.ts

import { conat } from "@cocalc/backend/conat";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
const DEFAULT_TIMEOUT = 15000;

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

async function callHub({
  client,
  account_id,
  service = "api",
  name,
  args = [],
  timeout = DEFAULT_TIMEOUT,
}: {
  client: ConatClient;
  account_id: string;
  service?: string;
  name: string;
  args?: any[];
  timeout?: number;
}) {
  const subject = `hub.account.${account_id}.${service}`;
  try {
    const data = { name, args };
    const resp = await client.request(subject, data, { timeout });
    return resp.data;
  } catch (err) {
    err.message = `${err.message} - callHub: subject='${subject}', name='${name}', code='${err.code}' `;
    throw err;
  }
}
