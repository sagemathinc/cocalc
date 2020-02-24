import { schema } from "./db-schema";
// The schema is got by combining the tables:
export const SCHEMA = schema;

// The tables
import "./account-creation-actions";
import "./account-profiles";
import "./accounts";
import "./blobs";
import "./client-error-log";
import "./central-log";
import "./collaborators";
import "./compute-servers";
import "./file-access-log";
import "./file-use";
import "./file-use-times";
import "./hub-servers";
import "./instances";  // probably deprecated
import "./listings";
import "./lti";
import "./password-reset";
import "./project-log";
import "./projects";
import "./public-paths";
import "./server-settings";
import "./site-licenses";
import "./site-settings";
import "./webapp-errors";

export {
  DEFAULT_FONT_SIZE,
  NEW_FILENAMES,
  DEFAULT_NEW_FILENAMES,
  DEFAULT_COMPUTE_IMAGE
} from "./defaults";

export { site_settings_conf } from "./site-defaults";

export { client_db } from "./client-db";
