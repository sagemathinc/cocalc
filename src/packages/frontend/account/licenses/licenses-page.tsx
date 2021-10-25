/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ManagedLicenses } from "./managed-licenses";
import { ProjectsWithLicenses } from "./projects-with-licenses";
import { AboutLicenses } from "./about-licenses";
import { PurchaseOneLicenseLink } from "../../site-licenses/purchase";
import { Footer } from "@cocalc/frontend/customize";

export const LicensesPage: React.FC = () => {
  return (
    <div>
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
