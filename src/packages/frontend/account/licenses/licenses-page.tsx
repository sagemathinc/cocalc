/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import { React } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components";
import { Footer } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import { DOC_LICENSE_URL } from "../../billing/data";
import { ManagedLicenses } from "./managed-licenses";
import { ProjectsWithLicenses } from "./projects-with-licenses";

export const LicensesPage: React.FC = () => {
  return (
    <div>
      <div style={{ fontSize: "12pt" }}>
        <h3>About</h3>
        <A href={DOC_LICENSE_URL}>Licenses</A> allow you to automatically
        upgrade projects whenever they start up, so that they have more memory,
        better hosting, run faster, etc.
      </div>
      <br />
      <div>
        <BuyLicenseForProject />
      </div>
      <div>
        <h3>Links</h3>
        <ul style={{ fontSize: "12pt" }}>
          <li>
            <A href={join(appBasePath, "licenses")}>
              License Management Center
            </A>
            : manage your licenses
          </li>
          <li>
            <A href={join(appBasePath, "pricing")}>Pricing</A>: an overview of
            all offered products.
          </li>
          <li>
            <A href={join(appBasePath, "billing")}>Billing</A>: information
            about your purchases,{" "}
            <A href={join(appBasePath, "billing", "subscriptions")}>
              cancelling subscriptions
            </A>
            , credit cards, invoices, etc.
          </li>
        </ul>
      </div>
      <br />
      <ManagedLicenses />
      <br />
      <ProjectsWithLicenses />
      <br />
      <Footer />
    </div>
  );
};
