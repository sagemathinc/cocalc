import {
  createDayStatements,
  createMonthStatements,
} from "./create-statements";
import emailNewStatements from "./email-new-statements";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:statements-maintenance");

// The default expore -- statementMaintenance -- gets called automatically
// every few minutes all day long.   It is responsible for ensuring that
// the 'day' and 'month' statements get created and statements get emailed out.
export default async function statementMaintenance() {
  logger.debug("statementMaintenance -- updating statements");
  try {
    await createDayStatements();
  } catch (err) {
    logger.debug(`WARNING: Nonfatal error creating day statements -- ${err}`);
  }
  try {
    await createMonthStatements();
  } catch (err) {
    logger.debug(`WARNING: Nonfatal error creating month statements -- ${err}`);
  }

  try {
    await emailNewStatements();
  } catch (err) {
    logger.debug(
      `WARNING: Nonfatal error emailing out new statements -- ${err}`
    );
  }
}
