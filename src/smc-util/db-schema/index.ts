import { schema } from "./db-schema";
import { account_creation_actions } from "./account-creation-actions";
import { account_profiles } from "./account-profiles";
import { accounts } from "./accounts";
import { blobs } from "./blobs";
import { client_error_log } from "./client-error-log";
import { central_log } from "./central-log";
import { collaborators, collaborators_one_project } from "./collaborators";
import { compute_servers } from "./compute-servers";
import { file_access_log } from "./file-access-log";
import { lti } from "./lti";
import {
  site_licenses,
  site_license_usage_stats,
  site_license_public_info,
  projects_using_site_license,
  site_license_usage_log
} from "./site-licenses";
import { listings } from "./listings";
import { file_use_times } from "./file-use-times";
import { webapp_errors } from "./webapp-errors";

export const SCHEMA = {
  ...schema,
  accounts,
  account_creation_actions,
  account_profiles,
  blobs,
  central_log,
  client_error_log,
  collaborators,
  collaborators_one_project,
  compute_servers,
  file_access_log,
  file_use_times,
  listings,
  lti,
  projects_using_site_license,
  site_licenses,
  site_license_usage_stats,
  site_license_public_info,
  site_license_usage_log,
  webapp_errors
};

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE
} from "./defaults";

export { site_settings_conf } from "./site-defaults";

export { client_db } from "./client-db";