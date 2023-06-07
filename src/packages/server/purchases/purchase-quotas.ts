import getPool from "@cocalc/database/pool";
import { QUOTA_NAMES } from "@cocalc/util/db-schema/purchase-quotas";
import getQuota from "./get-quota";

export async function setPurchaseQuota({
  account_id,
  name,
  value,
}: {
  account_id: string;
  name: string;
  value: number;
}): Promise<void> {
  if (!QUOTA_NAMES.includes(name)) {
    throw Error(
      `"${name}" must be one of the following: ${QUOTA_NAMES.join(", ")}`
    );
  }
  if (typeof value != "number" || !isFinite(value) || value < 0) {
    throw Error(`value must be a positive number but it is ${value}`);
  }
  const overallQuota = await getQuota(account_id);
  const cur = await getAllPurchaseQuotas(account_id);
  let s = value ?? 0;
  for (const key in cur) {
    if (key != name) {
      s += cur[key] ?? 0;
    }
  }
  if (s > overallQuota) {
    throw Error(
      `Your account has an overall quota limit of $${overallQuota} and increasing the ${name} quota to $${value} would exceed this.`
    );
  }
  const pool = getPool();
  if (cur[name] != null) {
    await pool.query(
      "UPDATE purchase_quotas SET value=$3 WHERE name=$2 AND account_id=$1",
      [account_id, name, value]
    );
  } else {
    await pool.query(
      "INSERT INTO purchase_quotas(account_id,name,value) VALUES($1,$2,$3)",
      [account_id, name, value]
    );
  }
}

async function getAllPurchaseQuotas(
  account_id: string
): Promise<{ [name: string]: number }> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT name, value FROM purchase_quotas WHERE account_id=$1",
    [account_id]
  );
  const x: { [name: string]: number } = {};
  for (const { name, value } of rows) {
    x[name] = value;
  }
  return x;
}
