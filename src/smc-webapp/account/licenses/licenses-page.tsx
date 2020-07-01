/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { ManagedLicenses } from "./managed-licenses";
import { ProjectsWithLicenses } from "./projects-with-licenses";
import { AboutLicenses } from "./about-licenses";
import { PurchaseLicense } from "./purchase-license";

export const LicensesPage: React.FC = () => {
  return (
    <div>
      <AboutLicenses />
      <br />
      <PurchaseLicense />
      <br />
      <ManagedLicenses />
      <br />
      <ProjectsWithLicenses />
    </div>
  );
};
