import { type Client } from "@cocalc/conat/core/client";
const DEFAULT_TIMEOUT = 15000;

export default async function callHub({
  client,
  account_id,
  project_id,
  name,
  args = [],
  timeout = DEFAULT_TIMEOUT,
}: {
  client: Client;
  account_id?: string;
  project_id?: string;
  name: string;
  args?: any[];
  timeout?: number;
}) {
  const subject = getSubject({ account_id, project_id });
  try {
    const data = { name, args };
    const resp = await client.request(subject, data, { timeout });
    return resp.data;
  } catch (err) {
    err.message = `${err.message} - callHub: subject='${subject}', name='${name}', code='${err.code}' `;
    throw err;
  }
}

function getSubject({ account_id, project_id }) {
  if (account_id) {
    return `hub.account.${account_id}.api`;
  } else if (project_id) {
    return `hub.project.${project_id}.api`;
  } else {
    throw Error("account_id or project_id must be specified");
  }
}
