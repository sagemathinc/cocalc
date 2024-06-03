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
*/

import { getCredentials } from "./client";
import getLogger from "@cocalc/backend/logger";
import { iam_v1 } from "googleapis";
import { JWT } from "google-auth-library";
//import type { GoogleCloudServiceAccountKey } from "@cocalc/util/db-schema/storage";

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

// create a google cloud service account with no capabilities
export async function createServiceAccount(accountId: string) {
  if (accountId.length < 6 || accountId.length > 30) {
    throw Error("accountId must be between 6 and 30 in length");
  }
  // todo: make sure deleting already deleted service account fully works.
  logger.debug("createServiceAccount", accountId);
  const { iam, credentials } = await getIamClient();
  await iam.projects.serviceAccounts.create({
    name: `projects/${credentials.projectId}`,
    requestBody: { accountId },
  });
}

export async function getServiceAccountName(
  accountId: string,
): Promise<string> {
  const { projectId } = await getCredentials();
  return `projects/${projectId}/serviceAccounts/${accountId}@${projectId}.iam.gserviceaccount.com`;
}

export async function deleteServiceAccount(accountId: string): Promise<void> {
  logger.debug("deleteServiceAccount", accountId);
  const { iam } = await getIamClient();
  await iam.projects.serviceAccounts.delete({
    name: await getServiceAccountName(accountId),
  });
}

// The following probably works, but it scared the living shit out of me today.
// I will only continue working on this when I setup a new GCP project for dev.

/*
import { PoliciesClient } from "@google-cloud/iam";
import { cloudresourcemanager_v1 } from "googleapis";

export async function addRoleToServiceAccount() {
  const { projectId } = await getCredentials();
  const bucketName = "compute-server-storage-2";
  const serviceAccountId = "bucket";

  const myBucketAdmin = `serviceAccount:${serviceAccountId}@${projectId}.iam.gserviceaccount.com`;
  const role = "roles/storage.objectAdmin";

  //   const auth = new GoogleAuth({
  //     credentials,
  //     scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  //   });

  //   const client = await auth.getClient();
  //   await client.authorize();
  const credentials = await getCredentials();
  const jwtClient = new JWT({
    email: credentials.credentials.client_email,
    key: credentials.credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  // Authenticate and initialize the googleapis client
  await jwtClient.authorize();

  // The resource name of the policy
  const resourceName = `projects/${projectId}/serviceAccounts/${serviceAccountId}`;

  const cloudresourcemanager = new cloudresourcemanager_v1.Cloudresourcemanager(
    {
      auth: jwtClient as any,
    },
  );

  const { data } = await cloudresourcemanager.projects.getIamPolicy({
    resource: projectId,
    requestBody: {
      resource: resourceName,
    },
  });

  const policyBindings = data.bindings || [];

  const newPolicyBinding = {
    role,
    members: [myBucketAdmin],
    condition: {
      title: "Condition for accessing the specific bucket",
      expression: `resource.name.startsWith('projects/_/buckets/${bucketName}')`,
    },
  };

  policyBindings.push(newPolicyBinding);

  // the code below sends all the existing bindings back.
  // if anything goes even slightly wrong then it could delete
  // all the policies entirely and break everything. use with caution.

  console.log("WOULD SET THESE POLICIES", policyBindings);
  return;

  await cloudresourcemanager.projects.setIamPolicy({
    resource: projectId,
    requestBody: {
      resource: resourceName,
      policy: {
        bindings: policyBindings,
        version: 3,
      },
    },
  });

  console.log(
    `Added the role ${role} to the service account ${serviceAccountId}.`,
  );
}
*/