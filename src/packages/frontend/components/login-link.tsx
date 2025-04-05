/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { Icon } from "./icon";
import Next from "@cocalc/frontend/components/next";
import { SiteName } from "@cocalc/frontend/customize";

export function LoginLink() {
  return (
    <Alert
      type="warning"
      style={{ margin: "15px" }}
      description={
        <div style={{ fontSize: "12pt" }}>
          <Icon
            name="sign-in"
            style={{ fontSize: "13pt", marginRight: "10px" }}
          />{" "}
          Please{" "}
          <Next sameTab href="/auth/sign-in">
            login to <SiteName />
          </Next>{" "}
          or{" "}
          <Next sameTab href="/auth/sign-up">
            create a <SiteName /> account
          </Next>
          ...
        </div>
      }
    />
  );
}
