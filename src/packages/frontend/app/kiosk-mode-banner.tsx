/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { SiteName } from "../customize";

import { APP_LOGO_WHITE } from "../art";

export const KioskModeBanner: React.FC = () => {
  return (
    <div id={"smc-startup-banner"}>
      <div>
        <img src={APP_LOGO_WHITE} />
      </div>
      <div
        className={"message ready"}
        style={{
          margin: "auto",
          textAlign: "center",
          fontSize: "36px",
          color: "#888",
        }}
      >
        <SiteName />
      </div>
    </div>
  );
};
