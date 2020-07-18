import { React } from "../../app-framework";

import { SiteLicensePublicInfo } from "../../site-licenses/site-license-public-info";

export const LicenseYouManage: React.FC<{ license_id: string }> = ({
  license_id,
}) => {
  return <SiteLicensePublicInfo license_id={license_id} />;
};
