/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import { DOC_LICENSE_URL } from "../../billing/data";
import { ManagedLicenses } from "./managed-licenses";
import { ProjectsWithLicenses } from "./projects-with-licenses";
import { SoftwareLicensesPage } from "./software-licenses";
import Next from "@cocalc/frontend/components/next";
import { A } from "@cocalc/frontend/components/A";

export function LicensesPage() {
  return (
    <div style={{ margin: "auto" }}>
      <SoftwareLicensesPage />
      <hr />
      <div style={{ fontSize: "12pt" }}>
        <h3>About</h3>
        <A href={DOC_LICENSE_URL}>Licenses</A> allow you to automatically
        upgrade projects whenever they start up, so that they have more memory,
        run faster, etc.
      </div>
      <br />
      <div>
        <BuyLicenseForProject noVoucher />
      </div>
      <ManagedLicenses />
      <ProjectsWithLicenses />
      <div>
        {/* kind of outdated */}
        <h3>Links</h3>
        <ul style={{ fontSize: "12pt" }}>
          <li>
            <Next href={"licenses"}>License Management Center</Next>: manage
            your licenses
          </li>
          <li>
            <Next href={"pricing"}>Pricing</Next>: an overview of all offered
            products.
          </li>
          <li>
            <Next href={"billing"}>Billing</Next>:{" "}
            <Next href={"billing/receipts"}>your purchases</Next>,{" "}
            <Next href={"billing/subscriptions"}>subscriptions</Next>,{" "}
            <Next href={"billing/cards"}>credit cards</Next>,{" "}
            <Next href={"billing/receipts"}>invoices</Next>, etc.
          </li>
        </ul>
      </div>
    </div>
  );
}
