import getPool from "@cocalc/database/pool";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import getMinBalance from "./get-min-balance";
import type { PoolClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings";
import { moneyToDbString, toDecimal, type MoneyValue } from "@cocalc/util/money";

export async function setPurchaseQuota({
  account_id,
  service,
  value,
}: {
  account_id: string;
  service: Service;
  value: number;
}): Promise<void> {
  if (!QUOTA_SPEC[service]) {
    throw Error(
      `"${service}" must be one of the following: ${Object.keys(QUOTA_SPEC)
        .filter((x) => !QUOTA_SPEC[x].noSet)
        .join(", ")}`,
    );
  }
  if (QUOTA_SPEC[service]?.noSet) {
    throw Error(
      `you cannot change the quota for the service "${QUOTA_SPEC[service].display}"`,
    );
  }
  if (typeof value != "number" || !Number.isFinite(value) || value < 0) {
    throw Error(`value must be a nonnegative number but it is "${value}"`);
  }
  const { services } = await getPurchaseQuotas(account_id);
  const pool = getPool();
  if (services[service] != null) {
    await pool.query(
      "UPDATE purchase_quotas SET value=$3 WHERE service=$2 AND account_id=$1",
      [account_id, service, moneyToDbString(value)],
    );
  } else {
    await pool.query(
      "INSERT INTO purchase_quotas(account_id,service,value) VALUES($1,$2,$3)",
      [account_id, service, moneyToDbString(value)],
    );
    if (
      service == "compute-server" &&
      services["compute-server-network-usage"] == null
    ) {
      // special case -- when you set the compute-server quota for the first time, the
      // compute-server-network-usage also gets set if it isn't set already.  This is
      // mainly to avoid confusion, but also just because I don't want to have to make
      // the new user frontend UI complicated right now with multiple quotas to buy one thing.
      await pool.query(
        "INSERT INTO purchase_quotas(account_id,service,value) VALUES($1,$2,$3)",
        [account_id, "compute-server-network-usage", moneyToDbString(value)],
      );
    }
  }
}

export interface PurchaseQuotas {
  services: { [service: string]: MoneyValue };
  minBalance: MoneyValue;
}

export async function getPurchaseQuotas(
  account_id: string,
  client?: PoolClient,
): Promise<PurchaseQuotas> {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    "SELECT service, value FROM purchase_quotas WHERE account_id=$1",
    [account_id],
  );

  const services: { [service: string]: MoneyValue } = {};
  for (const { service, value } of rows) {
    const isLLM = QUOTA_SPEC[service]?.category === "ai";
    const { llm_default_quota } = await getServerSettings();
    services[service] = value ?? (isLLM ? llm_default_quota : 0);
  }
  const minBalance = await getMinBalance(account_id, client);
  return { services, minBalance };
}

export async function getPurchaseQuota(
  account_id: string,
  service: Service,
  client?: PoolClient,
): Promise<number | null> {
  const pool = client ?? getPool();
  const { rows } = await pool.query(
    "SELECT value FROM purchase_quotas WHERE account_id=$1 AND service=$2",
    [account_id, service],
  );
  const isLLM = QUOTA_SPEC[service]?.category === "ai";
  if (isLLM) {
    const { llm_default_quota } = await getServerSettings();
    return toDecimal(rows[0]?.value ?? llm_default_quota).toNumber();
  } else {
    return rows[0]?.value == null
      ? null
      : toDecimal(rows[0]?.value).toNumber();
  }
}
