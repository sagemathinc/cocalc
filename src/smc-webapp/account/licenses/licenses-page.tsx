/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { ManagedLicenses } from "./managed-licenses";
import { AppliedLicenses } from "./applied-licenses";
import { AboutLicenses } from "./about-licenses";

export function LicensesPage(_props) {
  return (
    <div>
      <AboutLicenses />
      <br />
      <ManagedLicenses />
      <br />
      <AppliedLicenses />
    </div>
  );
}
