import { getCredentials } from "./client";
import { BigQuery } from "@google-cloud/bigquery";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const logger = getLogger("server:compute:cloud:google-cloud:bigquery");

export async function bigQuery(opts) {
  logger.debug("bigQuery", opts);
  const { google_cloud_bigquery_billing_service_account_json } =
    await getServerSettings();
  if (!google_cloud_bigquery_billing_service_account_json) {
    throw Error(
      `You must configure "Compute Servers: Google Cloud BigQuery Service Account Json" in admin settings`,
    );
  }
  const credentials = await getCredentials(
    google_cloud_bigquery_billing_service_account_json,
  );
  const bigquery = new BigQuery(credentials);
  const [rows] = await bigquery.query(opts);
  return rows;
}

export async function getCost({
  globalName,
  startTime,
  endTime,
}: {
  globalName: string;
  startTime: Date;
  endTime?: Date;
}): Promise<{ cost: number; description: string; start: Date; end: Date }[]> {
  const { projectId } = await getCredentials();
  const { google_cloud_bigquery_detailed_billing_table } =
    await getServerSettings();
  logger.debug("getCost", {
    projectId,
    google_cloud_bigquery_detailed_billing_table,
    globalName,
    startTime,
    endTime,
  });
  const query = `SELECT cost, usage.amount, usage.unit, usage_start_time, usage_end_time, sku.description
FROM ${google_cloud_bigquery_detailed_billing_table}
WHERE project.id = @projectId and resource.global_name=@globalName
AND usage_start_time >= TIMESTAMP(@startTime)
AND usage_end_time <= TIMESTAMP(@endTime)
ORDER BY usage_start_time`;
  const params = {
    projectId,
    globalName,
    startTime: startTime.toISOString(),
    endTime: (endTime ?? new Date()).toISOString(),
  };
  return (await bigQuery({ query: [query], params })).map((x) => {
    return {
      cost: x.cost,
      description: x.description,
      amount: x.amount,
      unit: x.unit,
      start: new Date(x.usage_start_time.value),
      end: new Date(x.usage_end_time.value),
    };
  });
}

export async function getBucketCost({
  bucketName,
  startTime,
  endTime,
}: {
  bucketName: string;
  startTime: Date;
  endTime?: Date;
}) {
  const globalName = `//storage.googleapis.com/projects/_/buckets/${bucketName}`;
  return await getCost({ globalName, startTime, endTime });
}
