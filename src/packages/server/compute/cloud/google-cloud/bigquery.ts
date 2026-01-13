import { getCredentials } from "./client";
import { BigQuery } from "@google-cloud/bigquery";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { GOOGLE_COST_LAG_MS } from "@cocalc/util/db-schema/compute-servers";
import { toDecimal } from "@cocalc/util/money";
export { GOOGLE_COST_LAG_MS }

const logger = getLogger("server:compute:cloud:google-cloud:bigquery");

export async function haveBigQueryBilling() {
  const {
    google_cloud_bigquery_detailed_billing_table,
    google_cloud_bigquery_billing_service_account_json,
  } = await getServerSettings();
  return (
    !!google_cloud_bigquery_detailed_billing_table &&
    !!google_cloud_bigquery_billing_service_account_json
  );
}

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

interface LineItem {
  cost: number;
  description: string;
  start: Date;
  end: Date;
  unit: string;
  amount: number;
}

// The time resolution is HOURS.  I.e., the start and end times for actual metered
// usage by Google cloud are exact hours, i.e., the minutes and seconds are always 0.
// There is a datapoint for each hour.  The data is delayed by about 24 hours, but
// I think we should assume a 48 hour delay to be 99% safe (nothing is actually safe
// because google has no SLA for this - in practice the lag is typically less than 1 day).
// We programatically enforce that all date inputs are at least this far in the past
// to ensure we do not undercharge due to missing data!
const MIN_LAG_DAYS = 1;

function assertLag(timestamp: Date) {
  if (Date.now() - timestamp.valueOf() < MIN_LAG_DAYS * 1000 * 60 * 60 * 24) {
    throw Error(`all dates must be at least ${MIN_LAG_DAYS} days in the past`);
  }
}

// Given the name of an instance or global resource (e.g., to a bucket),
// this function returns the cost (and a description for what is being charged)
// for every hour in the given date range, for *all* costs associated to that
// instance or bucket.  I.e., disk + ram + cpu + network.
export async function getCost({
  name,
  start,
  end,
}: {
  name: string;
  start: Date;
  end: Date;
}): Promise<LineItem[]> {
  const { projectId } = await getCredentials();
  const { google_cloud_bigquery_detailed_billing_table } =
    await getServerSettings();
  logger.debug("getCost", {
    projectId,
    google_cloud_bigquery_detailed_billing_table,
    name,
    start,
    end,
  });
  assertLag(start);
  assertLag(end);
  // NOTE: I don't understand why, but we have to exclude
  // the 'GCP Support Standard Variable fee' SKU id which
  // is sku.id!='E277-8566-63EE' or all support seems to be returned
  // as part of any query.  Maybe it's a BigQuery bug/feature?

  const query = `SELECT cost, usage.amount, usage.unit, usage_start_time, usage_end_time, sku.description
FROM ${google_cloud_bigquery_detailed_billing_table}
WHERE project.id = @projectId
AND usage_start_time >= TIMESTAMP(@start)
AND usage_end_time <= TIMESTAMP(@end)
AND (resource.${name.startsWith("/") ? "global_name" : "name"}=@name
OR resource.name LIKE @name2)
AND sku.id!='E277-8566-63EE'
ORDER BY usage_start_time`;
  const params = {
    projectId,
    name,
    name2: `projects/%/instances/${name}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
  const rows = await bigQuery({ query: [query], params });
  const data = rows.map((x) => {
    return {
      cost: x.cost,
      description: x.description,
      amount: x.amount,
      unit: x.unit,
      start: new Date(x.usage_start_time.value),
      end: new Date(x.usage_end_time.value),
    };
  }) as LineItem[];

  return data;
}

export async function getBucketCost({
  name,
  start,
  end,
}: {
  name: string;
  start: Date;
  end: Date;
}) {
  return await getCost({
    name: `//storage.googleapis.com/projects/_/buckets/${name}`,
    start,
    end,
  });
}

// Convert data returned by getCost to a map from
// description to the total of {cost,amount,unit}.
export function summarize(costs: LineItem[]): {
  [description: string]: { cost: number; amount: number; unit: string };
} {
  const m: {
    [description: string]: { cost: number; amount: number; unit: string };
  } = {};
  for (const { description, cost, amount, unit } of costs) {
    const costValue = toDecimal(cost);
    if (m[description] == null) {
      m[description] = { cost: costValue.toNumber(), amount, unit };
    } else {
      m[description].cost = toDecimal(m[description].cost)
        .add(costValue)
        .toNumber();
    }
  }
  return m;
}

export async function getInstanceTotalCost({
  name,
  start,
  end,
}: {
  name: string;
  start: Date;
  end: Date;
}): Promise<{
  cpu: number;
  ram: number;
  disk: number;
  network: number;
  external_ip: number;
  other: number;
}> {
  const costs = await getCost({ name, start, end });
  const s = summarize(costs);
  let c = {
    cpu: toDecimal(0),
    ram: toDecimal(0),
    network: toDecimal(0),
    external_ip: toDecimal(0),
    disk: toDecimal(0),
    other: toDecimal(0),
  };
  for (const description in s) {
    const d = description.toLowerCase();
    const costValue = toDecimal(s[description].cost ?? 0);
    if (costValue.eq(0)) {
      continue;
    }
    if (d.includes("network")) {
      c.network = c.network.add(costValue);
    } else if (d.includes(" core ")) {
      c.cpu = c.cpu.add(costValue);
    } else if (d.includes(" ram ")) {
      c.ram = c.ram.add(costValue);
    } else if (d.includes("capacity")) {
      c.disk = c.disk.add(costValue);
    } else if (d.includes("external ip")) {
      c.external_ip = c.external_ip.add(costValue);
    } else {
      logger.debug(
        "getInstanceTotalCost -- WARNING",
        { description },
        s[description],
        " not categorized",
      );
      c.other = c.other.add(costValue);
    }
  }
  return {
    cpu: c.cpu.toNumber(),
    ram: c.ram.toNumber(),
    disk: c.disk.toNumber(),
    network: c.network.toNumber(),
    external_ip: c.external_ip.toNumber(),
    other: c.other.toNumber(),
  };
}

export async function getBucketTotalCost({
  name,
  start,
  end,
}: {
  name: string;
  start: Date;
  end: Date;
}): Promise<{
  network: number;
  storage: number;
  classA: number;
  classB: number;
  autoclass: number;
  other: number;
}> {
  const costs = await getBucketCost({ name, start, end });
  const s = summarize(costs);
  let c = {
    network: toDecimal(0),
    storage: toDecimal(0),
    classA: toDecimal(0),
    classB: toDecimal(0),
    autoclass: toDecimal(0),
    other: toDecimal(0),
  };
  for (const description in s) {
    const d = description.toLowerCase();
    const costValue = toDecimal(s[description].cost ?? 0);
    if (d.includes("class a operation")) {
      c.classA = c.classA.add(costValue);
    } else if (d.includes("class b operation")) {
      c.classB = c.classB.add(costValue);
    } else if (d.startsWith("autoclass")) {
      c.autoclass = c.autoclass.add(costValue);
    } else if (d.startsWith("network") || d.startsWith("download")) {
      c.network = c.network.add(costValue);
    } else if (d.includes("storage")) {
      // autoclass ops also have "storage" in them, but
      // autoclass ops also *start with* the word "autoclass"
      c.storage = c.storage.add(costValue);
    } else {
      logger.debug(
        "getBucketTotalCost -- WARNING",
        { description },
        s[description],
        " not categorized",
      );
      c.other = c.other.add(costValue);
    }
  }
  return {
    network: c.network.toNumber(),
    storage: c.storage.toNumber(),
    classA: c.classA.toNumber(),
    classB: c.classB.toNumber(),
    autoclass: c.autoclass.toNumber(),
    other: c.other.toNumber(),
  };
}
