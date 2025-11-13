/*
Confirming with a modal if necessary that a user has available
funds for creating a cloud file system.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isPurchaseAllowed } from "../api";
import track from "@cocalc/frontend/user-tracking";
import { CREATE_CLOUD_FILESYSTEM_AMOUNT } from "@cocalc/util/db-schema/cloud-filesystems";

export default async function confirmCreateCloudFilesystem() {
  // Checking balance and limits...
  const service = "compute-server-storage";
  const cost = CREATE_CLOUD_FILESYSTEM_AMOUNT;
  const { allowed, reason } = await isPurchaseAllowed(service, cost);
  if (!allowed) {
    // Increasing balance or limits ...
    await webapp_client.purchases_client.quotaModal({
      service,
      reason,
      allowed,
      cost,
    });
    {
      // Check again, since result of modal may not be sufficient.
      // This time if not allowed, will show an error.
      // Checking balance and limits...
      const { allowed, reason } = await isPurchaseAllowed(service, cost);
      if (!allowed) {
        throw Error(reason);
      }
    }
  }
  track("cloud-filesystem", { action: "confirm-create" });
}
