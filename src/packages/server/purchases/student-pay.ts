import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { DEFAULT_PURCHASE_INFO } from "@cocalc/util/licenses/purchase/student-pay";
import type { CourseInfo } from "@cocalc/util/db-schema/projects";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
// import createPurchase from "@cocalc/server/purchases/create-purchase";
// import createLicense from "@cocalc/server/licenses/purchase/create-license";
import { assertPurchaseAllowed } from "./is-purchase-allowed";

const logger = getLogger("purchases:student-pay");

interface Options {
  account_id: string;
  project_id: string;
}

export default async function studentPay({ account_id, project_id }: Options) {
  logger.debug({ account_id, project_id });
  // get current value of course field of this project
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT course FROM projects WHERE project_id=$1",
    [project_id]
  );
  if (rows.length == 0) {
    throw Error("no such project");
  }
  const currentCourse: CourseInfo | undefined = rows[0].course;
  if (currentCourse?.account_id != account_id) {
    throw Error(`only ${account_id} can pay the course fee`);
  }
  const { payInfo: purchaseInfo } = currentCourse;
  const cost = getCost(purchaseInfo);
  await assertPurchaseAllowed({ account_id, service: "license", cost });
  // [ ] TODO: create the purchase and license in atomic transaction...
  // [ ] TODO: change purchaseInfo to indicate that purchase is done
  // [ ] TODO: change code for editing purchaseInfo to always maintain that purchase is done...

  return { status: "ok" };
}

export function getCost(purchaseInfo: PurchaseInfo | undefined): number {
  const cost = purchaseInfo?.cost;
  if (cost == null) {
    if (purchaseInfo != null) {
      return compute_cost(purchaseInfo).discounted_cost;
    }
    return compute_cost(DEFAULT_PURCHASE_INFO).discounted_cost;
  }
  if (typeof cost == "number") {
    // should never happen
    return cost;
  }
  return cost.discounted_cost;
}
