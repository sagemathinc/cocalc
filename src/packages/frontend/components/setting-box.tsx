/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card, Typography } from "antd";
import { CSSProperties, ReactNode } from "react";

import { CloseX2 } from "./close-x2";
import { Icon, IconName } from "./icon";

const { Title } = Typography;

interface Props {
  icon?: IconName;
  title?: ReactNode;
  subtitle?: ReactNode;
  show_header?: boolean;
  close?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
}

const STYLE = {
  marginBottom: "20px",
} as CSSProperties;

export function SettingBox({
  icon,
  title,
  subtitle,
  show_header = true,
  close,
  children,
  style,
  bodyStyle,
}: Props) {
  return (
    // type inner for the gray background in the header
    <Card
      title={
        show_header ? (
          <div style={{ whiteSpace: "normal" }}>
            <Title level={4} style={{ display: "flex" }}>
              {icon && <Icon name={icon} style={{ marginRight: "5px" }} />}
              &nbsp;{title}
            </Title>
            {subtitle}
            {/* subtitle must be outside of the Typography.Title -- this is assumed, e.g., in frontend/project/new/project-new-form.tsx */}
          </div>
        ) : undefined
      }
      extra={close != null ? <CloseX2 close={close} /> : undefined}
      type="inner"
      style={{ ...STYLE, ...style }}
      styles={{ body: bodyStyle }}
    >
      {children}
    </Card>
  );
}
