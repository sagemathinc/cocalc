/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, List } from "antd";
import { ReactNode } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { CSS } from "components/misc";

import styles from "./pricing.module.css";

interface Props {
  children: ReactNode;
  icon: IconName;
  title: string;
  style?: CSS;
  active?: boolean;
  onClick?: () => void;
}

const ACTIVE_STYLE: CSS = {
  outline: `2px solid ${COLORS.BLUE_D}`,
} as const;

export default function PricingItem({
  icon,
  children,
  title,
  style,
  active,
  onClick,
}: Props) {
  const outerStyle: CSS = {
    padding: 0,
    ...style,
  } as const;
  const activeStyle: CSS = active === true ? ACTIVE_STYLE : {};
  const innerStyle: CSS = { color: COLORS.GRAY_M, ...activeStyle };

  return (
    <List.Item style={outerStyle} onClick={onClick}>
      <Card
        className={onClick != null ? styles.item : undefined}
        styles={{ header: { backgroundColor: COLORS.BLUE_LLLL } }}
        style={innerStyle}
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
  indent?: boolean;
}

export function Line(props: Line) {
  const { amount, desc, indent = true } = props;
  if (!amount)
    return (
      <div>
        ---<b style={STYLE}>&nbsp;</b>
      </div>
    );

  let unit = "";
  if (typeof desc === "string") {
    if (desc?.includes("RAM") || desc?.includes("Disk")) {
      unit = " GB";
    } else if (desc?.includes("CPU")) {
      unit = amount == 1 ? "core" : "cores";
    } else if (desc == "Projects") {
      unit = "simultaneously running";
    } else if (desc?.includes("Overcommit")) {
      unit = "x";
    }
  }

  const indentStyle: CSS = indent ? { width: "3em", textAlign: "right" } : {};

  return (
    <div>
      <b style={STYLE}>
        <div style={{ display: "inline-block", ...indentStyle }}>{amount}</div>{" "}
        {unit}
      </b>{" "}
      {desc}
    </div>
  );
}
