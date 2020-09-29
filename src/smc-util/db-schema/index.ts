/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { SCHEMA } from "./types";

// The tables
import "./account-creation-actions";
import "./account-profiles";
import "./accounts";
import "./auth";
import "./blobs";
import "./client-error-log";
import "./central-log";
import "./collaborators";
import "./compute-images";
import "./compute-servers";
import "./copy-paths";
import "./file-access-log";
import "./file-use";
import "./file-use-times";
import "./hub-servers";
import "./instances"; // probably deprecated
import "./listings";
import "./lti";
import "./mentions";
import "./password-reset";
import "./project-info";
import "./project-log";
import "./projects";
import "./public-paths";
import "./project-invite-tokens";
import "./registration-tokens";
import "./server-settings";
import "./site-licenses";
import "./site-settings";
import "./stats";
import "./storage-servers";
import "./system-notifications";
import "./tracking";
import "./webapp-errors";
import "./site-whitelabeling";

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE,
  FALLBACK_COMPUTE_IMAGE,
} from "./defaults";

export { site_settings_conf } from "./site-defaults";

export { client_db } from "./client-db";
