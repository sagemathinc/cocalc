/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ReactNode, CSSProperties } from "react";
import { Card, Typography } from "antd";
import { CloseX2 } from "./close-x2";
import { Icon, IconName } from "./icon";

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
          <>
            <Typography.Title level={4}>
              {icon && <Icon name={icon} />} {title}
            </Typography.Title>
            {subtitle}
            {/* subtitle must be outside of the Typography.Title -- this is assumed, e.g., in frontend/project/new/project-new-form.tsx */}
          </>
        ) : undefined
      }
      extra={close != null ? <CloseX2 close={close} /> : undefined}
      type="inner"
      style={{ ...STYLE, ...style }}
      bodyStyle={bodyStyle}
    >
      {children}
    </Card>
  );
}
