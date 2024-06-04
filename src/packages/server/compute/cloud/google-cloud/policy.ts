import { getCredentials } from "./client";
import { cloudresourcemanager_v1 } from "googleapis";
import { assertValidServiceAccountId } from "./service-account";
import { JWT } from "google-auth-library";
import { isEqual } from "lodash";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:cloud:google-cloud:policy");

// This is expected to throw an exception in case of the
// race condition where two clients try to modify the policy
// at once.
// It is OK to call this multiple times with the same input; the
// new binding only gets added once.
export async function addBucketPolicyBinding(
  serviceAccountId: string,
  bucketName: string,
) {
  logger.debug("addBucketPolicyBinding", {
    serviceAccountId,
    bucketName,
  });
  assertValidServiceAccountId(serviceAccountId);
  const { credentials, projectId } = await getCredentials();
  const jwtClient = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  await jwtClient.authorize();

  const cloudresourcemanager = new cloudresourcemanager_v1.Cloudresourcemanager(
    {
      auth: jwtClient as any,
    },
  );

  const { data: policy } = await cloudresourcemanager.projects.getIamPolicy({
    resource: projectId,
    requestBody: {
      options: {
        requestedPolicyVersion: 3,
      },
    },
  });

  if (!policy.bindings || policy.bindings.length < 1) {
    throw Error(
      "BUG -- there have to be at least one binding, so something is weird and wrong",
    );

    /* Here's what it might look like, at minimum:
    [
    {
      role: 'roles/compute.serviceAgent',
      members: [
        'serviceAccount:service-316993131926@compute-system.iam.gserviceaccount.com'
      ]
    },
    {
      role: 'roles/editor',
      members: [
        'serviceAccount:316993131926-compute@developer.gserviceaccount.com',
        'serviceAccount:316993131926@cloudservices.gserviceaccount.com',
        'serviceAccount:dev-acount@cocalc-compute-dev.iam.gserviceaccount.com'
      ]
    },
    { role: 'roles/owner', members: [ 'user:wstein@sagemath.com' ] },
    {
      role: 'roles/resourcemanager.projectIamAdmin',
      members: [
        'serviceAccount:dev-acount@cocalc-compute-dev.iam.gserviceaccount.com'
      ]
    }
  ]
  */
  }
  const newPolicyBinding = {
    role: "roles/storage.objectAdmin",
    members: [
      `serviceAccount:${serviceAccountId}@${projectId}.iam.gserviceaccount.com`,
    ],
    condition: {
      title: `Admin the bucket ${bucketName}`,
      expression: `resource.name.startsWith('projects/_/buckets/${bucketName}')`,
    },
  };
  for (const binding of policy.bindings) {
    if (isEqual(binding, newPolicyBinding)) {
      logger.debug("addBucketPolicyBinding -- policy already in place");
      return;
    }
  }
  policy.bindings.push(newPolicyBinding);

  logger.debug("addBucketPolicyBinding -- adding new policy binding", {
    newPolicyBinding,
  });
  policy.version = 3;

  // In case of the obvious race condition, this will error, due to the policy.etag field,
  // as explained in https://cloud.google.com/iam/docs/policies#etag
  await cloudresourcemanager.projects.setIamPolicy({
    resource: projectId,
    requestBody: {
      policy,
    },
  });
}

export async function removeBucketPolicyBinding(
  serviceAccountId: string,
  bucketName: string,
) {
  logger.debug("removeBucketPolicyBinding", {
    serviceAccountId,
    bucketName,
  });
  assertValidServiceAccountId(serviceAccountId);
  throw Error("todo");
}
