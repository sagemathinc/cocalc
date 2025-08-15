/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import "./bookmarks";
import "./central-log";
import "./client-error-log";
import "./cloud-filesystems";
import "./collaborators";
import "./compute-images";
import "./compute-servers";
import "./copy-paths";
import "./crm";
import "./email-counter";
import "./file-access-log";
import "./file-use";
import "./groups";
import "./hub-servers";
import "./instances"; // probably deprecated
import "./listings";
import "./llm";
import "./lti";
import "./mentions";
import "./messages";
import "./news";
import "./organizations";
import "./password-reset";
import "./pg-system";
import "./project-invite-tokens";
import "./project-log";
import "./projects";
import "./public-path-stars";
import "./public-paths";
import "./purchase-quotas";
import "./purchases";
import "./registration-tokens";
import "./retention";
import "./server-settings";
import "./shopping-cart-items";
import "./site-licenses";
import "./site-settings";
import "./site-whitelabeling";
import "./statements";
import "./stats";
import "./subscriptions";
import "./syncstring-schema";
import "./system-notifications"; // deprecated: use "news" with channel="system"
import "./token-actions";
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
