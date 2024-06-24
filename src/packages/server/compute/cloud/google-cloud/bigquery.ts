import { getCredentials } from "./client";
import { BigQuery } from "@google-cloud/bigquery";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

const logger = getLogger("server:compute:cloud:google-cloud:bigquery");

export async function bigQuery(query: string) {
  logger.debug("bigQuery", query);
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
  return await bigquery.query(query);
}
