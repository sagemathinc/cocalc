import getPricingData from "../cloud/google-cloud/pricing-data";
import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:cloud-filesystem:cost-estimates");

export async function costEstimates({
  compute_server_id,
}: {
  compute_server_id: number;
}) {
  logger.debug("costEstimates", { compute_server_id });
  const pool = getPool("medium");
  const { rows: data } = await pool.query(
    "SELECT * FROM cloud_filesystem_metrics WHERE id=$1",
    [compute_server_id],
  );
  if (data.length == 0) {
    return [];
  }
  const { storage, markup } = await getPricingData();
  return { data, storage, markup };
}

/*  const { storage, markup } = await getPricingData();
  if (compute_server.configuration.cloud == "google-cloud") {
    const { region } = compute_server.configuration;
    const { bucket_location } = cloud_filesystem;
    if (region == bucket_location) {
      // free!
      return { cost_put_gib: 0, cost_get_gib: 0 };
    } else {
      // complicated -- TODO
    }
  } else if (compute_server.configuration.cloud == "hyperstack") {
    return { cost_put_gib: 0, cost_get_gib: 0.12 };
  } else if (compute_server.configuration.cloud == "onprem") {
    // NOTE: to China is $0.23 and Australia is $0.19 (!)
    // but everywhere else worldwide is $0.12/GB.  Leave off
    // the get price here, so use estimates in other code.
    return { cost_put_gib: 0 };
  }
  // go with same as for on prem
  return { cost_put_gib: 0 };
*/
