/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export { SCHEMA } from "./types";
export type {
  DBSchema,
  TableSchema,
  FieldSpec,
  UserOrProjectQuery,
} from "./types";
export type { RenderSpec } from "./render-types";
export type { RetentionModel } from "./retention";
export { retentionModels } from "./retention";

// The tables
import "./account-creation-actions";
import "./account-profiles";
import "./accounts";
import "./api-keys";
import "./auth";
import "./blobs";
import "./central-log";
import "./client-error-log";
import "./collaborators";
import "./compute-images";
import "./compute-servers";
import "./copy-paths";
import "./crm";
import "./email-counter";
import "./file-access-log";
import "./file-use-times";
import "./file-use";
import "./hub-servers";
import "./instances"; // probably deprecated
import "./jupyter";
import "./listings";
import "./lti";
import "./mentions";
import "./news";
import "./openai";
import "./organizations";
import "./password-reset";
import "./pg-system";
import "./project-info";
import "./project-invite-tokens";
import "./project-log";
import "./project-status";
import "./projects";
import "./public-path-stars";
import "./public-paths";
import "./purchases";
import "./registration-tokens";
import "./retention";
import "./server-settings";
import "./shopping-cart-items";
import "./site-licenses";
import "./site-settings";
import "./site-whitelabeling";
import "./stats";
import "./storage-servers";
import "./syncstring-schema";
import "./system-notifications"; // deprecated: use "news" with channel="system"
import "./tracking";
import "./usage-info";
import "./vouchers";
import "./webapp-errors";

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE,
  FALLBACK_COMPUTE_IMAGE,
} from "./defaults";

export * from "./operators";
export type { Operator } from "./operators";

export { site_settings_conf } from "./site-defaults";

export { client_db } from "./client-db";
