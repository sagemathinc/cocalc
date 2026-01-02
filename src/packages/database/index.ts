/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "./db";

// Export utility functions directly from their modules
export { pg_type } from "./postgres/utils/pg-type";
export { quote_field } from "./postgres/utils/quote-field";
export { expire_time } from "./postgres/utils/expire-time";
export { one_result } from "./postgres/utils/one-result";
export { all_results } from "./postgres/utils/all-results";
export { count_result } from "./postgres/utils/count-result";
export { stripNullFields } from "./postgres/utils/strip-null-fields";

// Export project columns from their TypeScript location
export {
  PROJECT_COLUMNS,
  PUBLIC_PROJECT_COLUMNS,
} from "./postgres/project/columns";

export { db };
export { default as getPool } from "./pool";
