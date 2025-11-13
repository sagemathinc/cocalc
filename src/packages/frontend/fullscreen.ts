/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* enable fullscreen mode upon a URL like /app?fullscreen and additionally
   kiosk-mode upon /app?fullscreen=kiosk
*/

// Import this to ensure that the query params have been restored.
import { IS_EMBEDDED } from "@cocalc/frontend/client/handle-target";

import { QueryParams } from "./misc/query-params";
export const COCALC_FULLSCREEN = IS_EMBEDDED
  ? "kiosk"
  : QueryParams.get("fullscreen");
export const COCALC_MINIMAL = COCALC_FULLSCREEN === "kiosk";

if (COCALC_MINIMAL) {
  console.log("CoCalc Kiosk Mode");
}
