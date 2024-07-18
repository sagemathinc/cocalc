/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Logger for a CoCalc project

The logger in packages/hub uses this one as well, but with some minor configuration changes.

Use this one throuout the project, since it automatically prefixes all log messages with "cocalc:project:"
*/

import { getLogger as getLoggerMain } from "@cocalc/backend/logger";

const rootLogger = getLoggerMain("project");

export default function getLogger(name: string) {
  return rootLogger.extend(name);
}

export { getLogger };
