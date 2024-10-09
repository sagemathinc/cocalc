/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { Card } from "antd";

export function NoNewNotifications({ text, style }) {
  return (
    <Card style={{ padding: "40px, 30px", textAlign: "center", ...style }}>
      <Icon name={"bell"} style={{ fontSize: "32px", color: "#a3aab1" }} />
      <h3>{text}.</h3>
    </Card>
  );
}
