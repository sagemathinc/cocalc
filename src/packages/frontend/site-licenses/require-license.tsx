import { Card } from "antd";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import { applyLicense } from "@cocalc/frontend/project/settings/site-license";
import { SiteLicenseInput } from "@cocalc/frontend/site-licenses/input";
import { Icon } from "@cocalc/frontend/components";

export default function RequireLicense({ project_id, message }) {
  return (
    <Card
      size="small"
      title={
        <h4>
          <div style={{ float: "right" }}>
            <BuyLicenseForProject project_id={project_id} />
          </div>
          <Icon name="key" /> Select License
        </h4>
      }
      style={{ margin: "10px 0" }}
    >
      <SiteLicenseInput
        requireValid
        confirmLabel={"Add this license"}
        onChange={(license_id) => {
          applyLicense({ project_id, license_id });
        }}
        requireLicense
        requireMessage={message}
      />
    </Card>
  );
}
