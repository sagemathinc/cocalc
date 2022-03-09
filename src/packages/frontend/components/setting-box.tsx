/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, CSS } from "@cocalc/frontend/app-framework";
import { Card, Typography } from "antd";
import { CloseX2 } from "./close-x2";
import { Icon, IconName } from "./icon";

interface Props {
  icon?: IconName;
  title?: string | JSX.Element;
  show_header?: boolean;
  close?: () => void;
  children?: React.ReactNode;
  style?: CSS;
  bodyStyle?: CSS;
}

const STYLE: CSS = {
  marginBottom: "20px",
};

export const SettingBox: React.FC<Props> = React.memo((props: Props) => {
  const {
    icon,
    title,
    show_header = true,
    close,
    children,
    style,
    bodyStyle,
  } = props;

  function renderTitle() {
    if (!show_header) {
      return;
    }

    return (
      <Typography.Title level={4}>
        {icon && <Icon name={icon} />} {title}
      </Typography.Title>
    );
  }

  function renderExtra() {
    if (typeof close !== "function") return;
    return <CloseX2 close={close} />;
  }

  return (
    // type inner for the gray background in the header
    <Card
      title={renderTitle()}
      extra={renderExtra()}
      type="inner"
      style={{ ...STYLE, ...style }}
      bodyStyle={bodyStyle}
    >
      {children}
    </Card>
  );
});
