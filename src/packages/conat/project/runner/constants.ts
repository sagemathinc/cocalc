import { join } from "path";

export const INTERNAL_SSH_CONFIG = ".ssh/.cocalc";

export const SSH_IDENTITY_FILE = join(INTERNAL_SSH_CONFIG, "id_ed25519");

export const FILE_SERVER_NAME = "core";