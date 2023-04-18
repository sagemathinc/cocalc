/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Row, Col } from "antd";

interface Props {
  label_cols?: number;
  label?: string | React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  extra_cols?: number;
  innerStyle?: React.CSSProperties;
}

export const LabeledRow: React.FC<Props> = ({
  children,
  style,
  label,
  className,
  label_cols = 4,
  extra,
  extra_cols = 1,
  innerStyle = { marginTop: "8px" },
}) => {
  const spanLabel = 2 * label_cols;
  const spanExtra = extra != null ? extra_cols : 0;
  const spanChildren = 24 - spanLabel - spanExtra;

  function renderExtra() {
    if (extra == null) return;
    return (
      <Col span={spanExtra} style={{ ...innerStyle, textAlign: "right" }}>
        {extra}
      </Col>
    );
  }

  return (
    <Row style={style} className={className}>
      <Col span={spanLabel} style={innerStyle}>
        {label}
      </Col>
      <Col span={spanChildren} style={innerStyle}>
        {children}
      </Col>
      {renderExtra()}
    </Row>
  );
};
