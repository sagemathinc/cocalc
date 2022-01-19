/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ManagedLicenses } from "./managed-licenses";
import { ProjectsWithLicenses } from "./projects-with-licenses";
import { AboutLicenses } from "./about-licenses";
import { PurchaseOneLicenseLink } from "../../site-licenses/purchase";
import { Footer } from "@cocalc/frontend/customize";
import { A } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import { Alert } from "antd";

export const LicensesPage: React.FC = () => {
  return (
    <div>
      <Alert
        showIcon
        style={{ maxWidth: "600px", margin: "30px auto" }}
        type="warning"
        message={
          <>
            This is the old licenses page (which still works).{" "}
            <A href={join(appBasePath, "licenses")}>Try the new page...</A>
          </>
        }
      />
      <AboutLicenses />
      <br />
      <PurchaseOneLicenseLink />
      <br />
      <ManagedLicenses />
      <br />
      <ProjectsWithLicenses />
      <br />
      <Footer />
    </div>
  );
};
