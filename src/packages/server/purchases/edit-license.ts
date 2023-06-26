import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:edit-license");

interface Options {
  account_id: string;
  license_id: string;
  expires?: Date;
}

export default function editLicense({
  account_id,
  license_id,
  expires,
}: Options) {
  logger.debug("editLicense", { account_id, license_id, expires });
}
