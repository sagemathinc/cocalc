/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Typography } from "antd";
import { useState } from "react";
import { SoftwareLicensesPage } from "./software-licenses";
import { A } from "@cocalc/frontend/components/A";
import MembershipPurchaseModal from "../membership-purchase-modal";
import { PolicyPricingPageUrl } from "../../customize";

export function LicensesPage() {
  const [showMembership, setShowMembership] = useState(false);
  return (
    <div style={{ margin: "auto" }}>
      <SoftwareLicensesPage />
      <hr />
      <div style={{ fontSize: "12pt" }}>
        <h3>About</h3>
        <Typography.Paragraph>
          Project upgrades are now handled through memberships. Project licenses
          are no longer available.
        </Typography.Paragraph>
        <Button type="primary" onClick={() => setShowMembership(true)}>
          Change membership
        </Button>
        <div style={{ marginTop: "10px" }}>
          <A href={PolicyPricingPageUrl}>See pricing and memberships</A>
        </div>
      </div>
      <MembershipPurchaseModal
        open={showMembership}
        onClose={() => setShowMembership(false)}
      />
    </div>
  );
}
