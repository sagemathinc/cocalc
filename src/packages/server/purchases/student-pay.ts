/*
Run this function so that the user buys a license and upgrades the given project
with that license exactly as prescribed by "student pay" for a course.

This fails if:

 - The user doesn't have sufficient funds on their account to pay for the license.
 - The user is not the STUDENT that the project is meant for.
 - The course fee was already paid.

Everything is done in a single atomic transaction.
*/

import { getTransactionClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { DEFAULT_PURCHASE_INFO } from "@cocalc/util/licenses/purchase/student-pay";
import type { CourseInfo } from "@cocalc/util/db-schema/projects";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import { assertPurchaseAllowed } from "./is-purchase-allowed";
import setCourseInfo from "@cocalc/server/projects/course/set-course-info";
import addLicenseToProject from "@cocalc/server/licenses/add-to-project";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import type { StudentPay } from "@cocalc/util/db-schema/token-actions";
import createTokenAction, {
  getTokenUrl,
} from "@cocalc/server/token-actions/create";
import dayjs from "dayjs";

const logger = getLogger("purchases:student-pay");

interface Options {
  account_id: string;
  project_id: string;
}

export default async function studentPay({
  account_id,
  project_id,
}: Options): Promise<{ purchase_id: number }> {
  logger.debug({ account_id, project_id });
  const client = await getTransactionClient();
  try {
    // start atomic transaction:
    // Creating the license and the purchase and recording that student paid all happen as a single PostgreSQL atomic transaction.

    // Get current value of course field of this project
    const { rows } = await client.query(
      "SELECT course, title, description FROM projects WHERE project_id=$1",
      [project_id]
    );
    if (rows.length == 0) {
      throw Error("no such project");
    }
    const currentCourse: CourseInfo | undefined = rows[0].course;
    // ensure account_id matches the student; this also ensures that currentCourse is not null.
    if (currentCourse?.account_id != account_id) {
      throw Error(`only ${account_id} can pay the course fee`);
    }
    if (currentCourse.paid) {
      throw Error("course fee already paid");
    }
    const { title, description } = rows[0];
    const purchaseInfo = {
      ...(currentCourse.payInfo ?? DEFAULT_PURCHASE_INFO),
      title,
      description,
    };
    if (purchaseInfo.type != "quota") {
      // typescript wants this
      throw Error("must purchase a quota license");
    }
    const cost = getCost(purchaseInfo);
    await assertPurchaseAllowed({
      account_id,
      service: "license",
      cost,
      client,
    });

    // Create the license
    const license_id = await createLicense(account_id, purchaseInfo, client);

    // Add license to the project.
    await addLicenseToProject({ project_id, license_id, client });

    // nonblocking restart if running - not part of transaction, could take a while,
    // and no need to block everything else on this.
    (async () => {
      try {
        await restartProjectIfRunning(project_id);
      } catch (err) {
        // non-fatal, since it's just a convenience.
        logger.debug("WARNING -- issue restarting project ", err);
      }
    })();

    // Create the purchase
    const purchase_id = await createPurchase({
      account_id,
      service: "license",
      cost,
      period_start: purchaseInfo.start,
      period_end: purchaseInfo.end,
      description: {
        type: "license",
        license_id,
        info: purchaseInfo,
        course: currentCourse,
      },
      client,
    });

    // Change purchaseInfo to indicate that purchase is done
    currentCourse.paid = new Date().toISOString();
    await setCourseInfo({
      project_id,
      account_id,
      course: currentCourse,
      noCheck: true,
      client,
    });
    await client.query("COMMIT");

    return { purchase_id };
  } catch (err) {
    logger.debug("error -- reverting transaction", err);
    await client.query("ROLLBACK");
    throw err;
  } finally {
    // end atomic transaction
    client.release();
  }
}

export function getCost(purchaseInfo: PurchaseInfo): number {
  const cost = purchaseInfo?.cost;
  if (cost == null) {
    return compute_cost(purchaseInfo).discounted_cost;
  }
  if (typeof cost == "number") {
    // should never happen
    return cost;
  }
  return cost.discounted_cost;
}

export async function studentPayLink({
  account_id,
  project_id,
}: Options): Promise<string> {
  return await getTokenUrl(
    await createTokenAction(
      { type: "student-pay", account_id, project_id } as StudentPay,
      dayjs().add(1, "week").toDate()
    )
  );
}
