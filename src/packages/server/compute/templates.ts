/*
A compute server "template" is just an existing compute server that has template.enabled true.
That's it!  Any actual data stored on the compute server or the state of the compute server is
not relevant.

Admins can set an existing compute server to be a template.  Non-admins can't.
*/

import getPool from "@cocalc/database/pool";
import { computeCost } from "@cocalc/server/compute/control";
import { getServerNoCheck } from "@cocalc/server/compute/get-servers";
import getLogger from "@cocalc/backend/logger";
import { cmp } from "@cocalc/util/misc";
import type { ComputeServerTemplate } from "@cocalc/util/db-schema/compute-servers";
import { createTTLCache } from "@cocalc/server/compute/database-cache";
import type { ConfigurationTemplate } from "@cocalc/util/compute/templates";
import { getImages } from "@cocalc/server/compute/images";
import getGoogleCloudPricingData from "@cocalc/server/compute/cloud/google-cloud/pricing-data";
import getHyperstackPricingData from "@cocalc/server/compute/cloud/hyperstack/pricing-data";

const logger = getLogger("server:compute:templates");

// Cache templates one hour, unless admin changes template state, which clears cache.
const CACHE_KEY = "templates";
let templatesCache: any = null;

function getCache() {
  if (templatesCache == null) {
    templatesCache = createTTLCache({
      ttl: 60 * 60 * 1000,
      cloud: "templates",
    });
  }
  return templatesCache;
}

export async function setTemplate({
  account_id,
  id,
  template,
}: {
  account_id: string;
  id: number;
  template: ComputeServerTemplate;
}) {
  logger.debug("setTemplate", { id, template });
  const pool = getPool();
  const { rowCount } = await pool.query(
    "UPDATE compute_servers SET template=$1 WHERE id=$2 AND account_id=$3",
    [template, id, account_id],
  );
  if (rowCount == 0) {
    throw Error(
      `invalid id (=${id}) or attempt to change compute server by a non-owner, which is not allowed.`,
    );
  }
  await getCache().delete(CACHE_KEY);
}

const FIELDS =
  " id, title, color, cloud, configuration, template, avatar_image_tiny, position ";

export async function getTemplate(id): Promise<ConfigurationTemplate> {
  logger.debug("getTemplate", { id });
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM compute_servers WHERE id=$1 AND template#>>'{enabled}'='true'`,
    [id],
  );
  if (rows.length == 0) {
    throw Error(`no template with id (=${id})`);
  }
  sanitizeTemplate(rows[0]);
  return rows[0];
}

// Get all template compute server configurations, along with their current price.

export async function getTemplates() {
  if (await getCache().has(CACHE_KEY)) {
    return await getCache().get(CACHE_KEY);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT ${FIELDS} FROM compute_servers WHERE template#>>'{enabled}'='true'`,
  );
  const templates: ConfigurationTemplate[] = [];
  for (const row of rows) {
    const server = await getServerNoCheck(row.id);
    let cost_per_hour;
    try {
      cost_per_hour = {
        running: await computeCost({ server, state: "running" }),
        off: await computeCost({ server, state: "off" }),
      };
    } catch (err) {
      console.warn(
        `unable to compute template costs -- id=${row.id}, err=${err}`,
      );
      continue;
    }
    templates.push({ ...row, cost_per_hour });
  }
  templates.sort(
    (x, y) =>
      -cmp(
        x.template.priority ?? x.position ?? 0,
        y.template.priority ?? y.position ?? 0,
      ),
  );
  const clouds = new Set<string>();
  for (const template of templates) {
    sanitizeTemplate(template);
    clouds.add(template.cloud);
  }
  const data = {
    images: await getImages(),
    hyperstackPriceData: clouds.has("hyperstack")
      ? await getHyperstackPricingData()
      : undefined,
    googleCloudPriceData: clouds.has("google-cloud")
      ? await getGoogleCloudPricingData()
      : undefined,
  };
  const x = { templates, data };
  await getCache().set(CACHE_KEY, x);
  return x;
}

function sanitizeTemplate(template) {
  delete template["configuration"]?.authToken;
}
