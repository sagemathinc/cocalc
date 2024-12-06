/*
Run this function so that the user buys a license and upgrades the given project
with that license exactly as prescribed by "student pay" for a course.

This fails if:

 - The user doesn't have sufficient funds on their account to pay for the license (unless amount is sufficient).
 - The course fee was already paid.

Everything is done in a single atomic transaction.
*/

import getPool from "@cocalc/database/pool";
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
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import type { StudentPay } from "@cocalc/util/db-schema/token-actions";
import createTokenAction, {
  getTokenUrl,
} from "@cocalc/server/token-actions/create";
import dayjs from "dayjs";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { len } from "@cocalc/util/misc";
import addLicenseToProject from "@cocalc/server/licenses/add-to-project";
import removeLicenseFromProject from "@cocalc/server/licenses/remove-from-project";

const logger = getLogger("purchases:student-pay");

interface Options {
  account_id: string;
  project_id: string;

  // if given, then we just captured this amount of money from the payee; if it is
  // enough to cover the purchase -- irregardless of possible negative balance --
  // we always allow the purchase.
  amount?: number;
}

export default async function studentPay({
  account_id,
  project_id,
  amount,
}: Options): Promise<{ purchase_id: number }> {
  logger.debug({ account_id, project_id });
  const client = await getTransactionClient();
  try {
    // start atomic transaction:
    // Creating the license and the purchase and recording that student paid all happen as a single PostgreSQL atomic transaction.

    // Get current value of course field of this project
    const { rows } = await client.query(
      "SELECT course, title, description FROM projects WHERE project_id=$1",
      [project_id],
    );
    if (rows.length == 0) {
      throw Error("no such project");
    }
    const currentCourse: CourseInfo | undefined = rows[0].course;
    if (currentCourse == null) {
      throw Error("course fee not configured for this project");
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
      amount,
    });

    // Create the license, **owned by the student**
    const license_id = await createLicense(
      currentCourse?.account_id ?? account_id,
      purchaseInfo,
      client,
    );

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

    if (purchaseInfo.start == null || purchaseInfo.end == null) {
      throw Error("start and end must be set");
    }

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

export function getCost(
  purchaseInfo: PurchaseInfo = DEFAULT_PURCHASE_INFO,
): number {
  const cost = purchaseInfo?.cost;
  if (cost == null) {
    return compute_cost(purchaseInfo).cost;
  }
  if (typeof cost == "number") {
    // should never happen
    return cost;
  }
  return cost.cost;
}

export async function studentPayLink({
  account_id,
  project_id,
}: Options): Promise<string> {
  return await getTokenUrl(
    await createTokenAction(
      { type: "student-pay", account_id, project_id } as StudentPay,
      dayjs().add(1, "week").toDate(),
    ),
  );
}

export async function studentPayTransfer({
  account_id,
  project_id,
  paid_project_id,
}) {
  logger.debug("studentPayTransfer", {
    account_id,
    project_id,
    paid_project_id,
  });
  // make some basic checks, then update the database.
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }
  if (!(await isCollaborator({ account_id, project_id: paid_project_id }))) {
    throw Error("user must be collaborator on project");
  }

  const target = await getCourseInfo(project_id);
  const paid = await getCourseInfo(paid_project_id);
  if (target?.course == null || paid?.course == null) {
    throw Error("not a course project");
  }
  if (!paid.course.paid) {
    throw Error("paid project not paid");
  }
  if (paid.site_license == null || len(paid.site_license) == 0) {
    throw Error("paid project doesn't have a license");
  }
  const license_id = Object.keys(paid.site_license)[0];
  if (!license_id) {
    throw Error("problem with paid project license");
  }
  const pool = getPool();

  await pool.query(
    "UPDATE projects SET course=jsonb_set(course, '{paid}', to_jsonb(NOW()::text)) WHERE project_id=$1",
    [project_id],
  );

  // add license_id to new project
  await addLicenseToProject({ project_id, license_id });

  // remove license_id from paid project
  await removeLicenseFromProject({ project_id: paid_project_id, license_id });

  // remove fact that paid from paid project
  // (should do this as a transaction but that is a pain and if things go wrong
  // we just error in the students favor here)
  await pool.query(
    "UPDATE projects SET course=course#-'{paid}' WHERE project_id=$1",
    [paid_project_id],
  );
}

async function getCourseInfo(project_id) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT course, site_license FROM projects WHERE project_id=$1",
    [project_id],
  );
  return rows[0];
}

async function studentPayUnlock({ project_id }) {
  console.log({ project_id });
  throw Error("TODO [ ]! ");
}
