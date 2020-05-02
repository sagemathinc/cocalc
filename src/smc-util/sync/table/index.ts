/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Function to make one:
export { synctable } from "./global-cache";

// Type of it.
export {
  SyncTable,
  Query,
  QueryOptions,
  VersionedChange,
  State as SyncTableState,
} from "./synctable";

export { synctable_no_changefeed } from "./synctable-no-changefeed";

export { synctable_no_database } from "./synctable-no-database";
