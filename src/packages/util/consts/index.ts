/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
RANDOM constants that we might use anywhere in cocalc go here.
*/

export { NOT_SIGNED_IN, versionCookieName } from "./auth";

export { CONAT_LLM_HISTORY_KEY } from "./llm";

export { DUMMY_SECRET } from "./project";

export {
  DEFAULT_R2_REGION,
  R2_REGION_LABELS,
  R2_REGIONS,
  mapCloudRegionToR2Region,
  parseR2Region,
  type R2Region,
} from "./r2-regions";

export { SERVER_SETTINGS_ENV_PREFIX } from "./server_settings";
