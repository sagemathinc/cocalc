/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, List } from "antd";
import { ReactNode } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  children: ReactNode;
  icon: IconName;
  title: string;
}

export default function PricingItem({ icon, children, title }: Props) {
  return (
    <List.Item style={{ padding: 0 }}>
      <Card
        styles={{ header: { backgroundColor: "#d9edf7" } }}
        style={{ color: COLORS.GRAY_M }}
        type="inner"
        title={
          <span style={{ fontSize: "120%" }}>
            <Icon name={icon} style={{ marginRight: "10px" }} />{" "}
            <strong>{title}</strong>
          </span>
        }
      >
        {children}
      </Card>
    </List.Item>
  );
}

const STYLE: React.CSSProperties = {
  marginRight: "5px",
  display: "inline-block",
  color: COLORS.GRAY_DD,
} as const;

interface Line {
  amount?: string | number | ReactNode;
  desc?: string | ReactNode;
}

export function Line(props: Line) {
  const { amount, desc } = props;
  if (!amount)
    return (
      <div>
        ---<b style={STYLE}>&nbsp;</b>
      </div>
    );

  let unit = "";
  if (typeof desc === "string") {
    if (desc?.includes("RAM") || desc?.includes("Disk")) {
      unit = "G";
    } else if (desc?.includes("CPU")) {
      unit = amount == 1 ? "core" : "cores";
    } else if (desc == "Projects") {
      unit = "simultaneously running";
    } else if (desc?.includes("Overcommit")) {
      unit = "x";
    }
  }
  return (
    <div>
      <b style={STYLE}>
        <div
          style={{ display: "inline-block", width: "3em", textAlign: "right" }}
        >
          {amount}
        </div>{" "}
        {unit}
      </b>{" "}
      {desc}
    </div>
  );
}
