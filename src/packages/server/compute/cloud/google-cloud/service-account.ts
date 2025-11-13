/*
We have to use the older https://www.npmjs.com/package/googleapis
instead of @google-cloud/iam*, at least in mid 2024, since the
latter seems barely implemented.

I figured out enough of using googleapis via phind.com and reading
source code through VS Code.

There is a default limit of 100 service accounts per project according
to https://cloud.google.com/iam/docs/service-account-overview
One can request an increase.  The quota filter to use is
"ServiceAccountsPerProject".  For me right now this says "Unlimited"
as the value, so maybe this is unlimited now?  I wrote to Google about this.

Testing this, I quickly hit a rate limit

> for(let i=0;i<110;i++){await a.createServiceAccount(`cocalc-${i}`)}

"      message: 'A quota has been reached for project number 170126117476: Service accounts created per minute per project.',
      domain: 'global',
      reason: 'rateLimitExceeded'"

That's fair, try again:

d = require('awaiting')
for(let i=31;i<110;i++){await a.createServiceAccount(`cocalc-${i}`); await d.delay(10000)}

for(let i=0;i<110;i++){await a.deleteServiceAccount(`cocalc-${i}`); await d.delay(1000)}




NOTE: "Google Cloud service account keys by default do not expire." -- https://cloud.google.com/blog/products/identity-security/introducing-time-bound-key-authentication-for-service-accounts
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { iam_v1 } from "googleapis";
import { JWT } from "google-auth-library";
import type { GoogleCloudServiceAccountKey } from "@cocalc/util/db-schema/cloud-filesystems";

const logger = getLogger("server:compute:cloud:google-cloud:service-account");

export async function getIamClient() {
  const credentials = await getCredentials();
  const jwtClient = new JWT({
    email: credentials.credentials.client_email,
    key: credentials.credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  // Authenticate and initialize the googleapis client
  await jwtClient.authorize();
  const iam = new iam_v1.Iam({
    // "as any" justification: it wants OAuth2Client and jwtClient is that
    // but typescript doesn't like this. It does work.
    auth: jwtClient as any,
  });
  return { iam, credentials };
}

export function assertValidServiceAccountId(serviceAccountId: string) {
  if (serviceAccountId.length < 6 || serviceAccountId.length > 30) {
    throw Error("accountId must be between 6 and 30 in length");
  }
}

// create a google cloud service account with no capabilities
export async function createServiceAccount(serviceAccountId: string) {
  assertValidServiceAccountId(serviceAccountId);
  // todo: make sure deleting already deleted service account fully works.
  logger.debug("createServiceAccount", serviceAccountId);
  const { iam, credentials } = await getIamClient();
  try {
    await iam.projects.serviceAccounts.create({
      name: `projects/${credentials.projectId}`,
      requestBody: { accountId: serviceAccountId },
    });
  } catch (err) {
    logger.debug(
      "createServiceAccount",
      serviceAccountId,
      " WARNING -- failed to create ",
      err,
    );
    // maybe it already exists? if this doesn't throw we are good since it exists.
    await iam.projects.serviceAccounts.get({
      name: await getServiceAccountName(serviceAccountId),
    });
  }
}

export async function getServiceAccountName(
  serviceAccountId: string,
): Promise<string> {
  const { projectId } = await getCredentials();
  return `projects/${projectId}/serviceAccounts/${serviceAccountId}@${projectId}.iam.gserviceaccount.com`;
}

export async function deleteServiceAccount(
  serviceAccountId: string,
): Promise<void> {
  logger.debug("deleteServiceAccount", serviceAccountId);
  const { iam } = await getIamClient();
  await iam.projects.serviceAccounts.delete({
    name: await getServiceAccountName(serviceAccountId),
  });
}

// given a serviceAccountId, create a JSON key for that service account, which
// we can store on disk and use to access Google Cloud.
export async function createServiceAccountKey(
  serviceAccountId: string,
): Promise<GoogleCloudServiceAccountKey> {
  const { iam } = await getIamClient();
  const name = await getServiceAccountName(serviceAccountId);
  const res = await iam.projects.serviceAccounts.keys.create({ name });
  // res.data is the created key, it has a "privateKeyData" field that is a base64-encoded JSON key
  const privateKeyData = Buffer.from(
    res.data.privateKeyData!,
    "base64",
  ).toString("utf8");
  const key = JSON.parse(privateKeyData);

  return key;
}
