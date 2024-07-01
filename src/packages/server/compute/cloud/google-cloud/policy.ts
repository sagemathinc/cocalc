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

export async function addBucketPolicyBinding({
  serviceAccountId,
  bucketName,
}: {
  serviceAccountId: string;
  bucketName: string;
}) {
  logger.debug("addBucketPolicyBinding", {
    serviceAccountId,
    bucketName,
  });
  assertValidServiceAccountId(serviceAccountId);
  const { cloudresourcemanager, projectId } = await getCloudResourceManager();

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
  }
  const newPolicyBinding = getBucketPolicyBinding({
    serviceAccountId,
    bucketName,
    projectId,
  });
  if (policy.bindings == null) {
    throw Error("bug");
  }
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

export async function getCloudResourceManager() {
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
  return { cloudresourcemanager, projectId };
}

export async function getProjectNumber(): Promise<number> {
  const { cloudresourcemanager, projectId } = await getCloudResourceManager();
  const response = await cloudresourcemanager.projects.get({ projectId });
  if (response.data.projectNumber == null) {
    throw Error("no project number known");
  }
  return parseInt(response.data.projectNumber);
}

function getBucketPolicyBinding({ serviceAccountId, bucketName, projectId }) {
  return {
    role: "roles/storage.objectAdmin",
    members: [
      `serviceAccount:${serviceAccountId}@${projectId}.iam.gserviceaccount.com`,
    ],
    condition: {
      title: `Admin the bucket ${bucketName}`,
      expression: `resource.name.startsWith('projects/_/buckets/${bucketName}')`,
    },
  };
}

export async function removeBucketPolicyBinding({
  serviceAccountId,
  bucketName,
}: {
  serviceAccountId: string;
  bucketName: string;
}) {
  logger.debug("removeBucketPolicyBinding", {
    serviceAccountId,
    bucketName,
  });
  assertValidServiceAccountId(serviceAccountId);
  const { cloudresourcemanager, projectId } = await getCloudResourceManager();
  const bucketBinding = getBucketPolicyBinding({
    serviceAccountId,
    bucketName,
    projectId,
  });

  const { data: policy } = await cloudresourcemanager.projects.getIamPolicy({
    resource: projectId,
    requestBody: {
      options: {
        requestedPolicyVersion: 3,
      },
    },
  });

  if (policy.bindings == null) {
    throw Error("bug");
  }
  const newBindings = policy.bindings.filter(
    (binding) => !isEqual(binding, bucketBinding),
  );
  if (newBindings.length == policy.bindings.length) {
    logger.debug("removeBucketPolicyBinding -- policy already removed");
  }

  if (newBindings.length < 1) {
    throw Error(
      "BUG -- there have to be at least one binding, so something is weird and wrong",
    );
  }

  policy.version = 3;
  policy.bindings = newBindings;
  await cloudresourcemanager.projects.setIamPolicy({
    resource: projectId,
    requestBody: {
      policy,
    },
  });
}

export async function addStorageTransferPolicy(accountEmail: string) {
  logger.debug("addStorageTransferPolicy", { accountEmail });
  const { cloudresourcemanager, projectId } = await getCloudResourceManager();

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
  }
  const member = `serviceAccount:${accountEmail}`;
  for (const { role, members } of policy.bindings) {
    if (role == "roles/storage.admin" && members?.[0] == member) {
      logger.debug("addStorageTransferPolicy -- already there");
      return;
    }
  }
  logger.debug("addStorageTransferPolicy -- have to add it");
  policy.bindings.push({
    role: "roles/storage.admin",
    members: [member],
  });
  policy.version = 3;
  await cloudresourcemanager.projects.setIamPolicy({
    resource: projectId,
    requestBody: {
      policy,
    },
  });
}
