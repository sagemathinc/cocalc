/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";

export const CourseProjectExtraHelp: React.FC = () => {
  return (
    <div style={{ marginTop: "10px" }}>
      If you have already paid, you can go to the settings in your project and
      click the "Adjust your quotas..." button, then click the checkboxes next
      to network and member hosting. If it says you do not have enough quota,
      visit the Upgrades tab in account settings, see where the upgrades are,
      remove them from another project, then try again.
    </div>
  );
};


