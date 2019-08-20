import { schema } from "./db-schema";
import { account_creation_actions } from "./account-creation-actions";
import { accounts } from "./accounts";

export const SCHEMA = { ...schema, account_creation_actions, accounts };

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE
} from "./defaults";

export { site_settings_conf } from "./site-defaults";
export { client_db } from "./db-schema";
