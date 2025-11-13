/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Row, Col, Descriptions } from "antd";

interface Props {
  label_cols?: number;
  label?: string | React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  extra_cols?: number;
  innerStyle?: React.CSSProperties;
  vertical?: boolean;
}

export const LabeledRow: React.FC<Props> = ({
  children,
  style,
  label,
  className,
  label_cols = 3,
  extra,
  extra_cols = 1,
  innerStyle = { marginTop: "8px" },
  vertical = false,
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

  function renderHorizontal() {
    return (
      <Row style={style} className={className}>
        <Col span={spanLabel} style={innerStyle}>
          <strong>{label}</strong>
        </Col>
        <Col span={spanChildren} style={innerStyle}>
          {children}
        </Col>
        {renderExtra()}
      </Row>
    );
  }

  function renderVertical() {
    return (
      <Descriptions style={style} layout="vertical" column={1} size={"small"}>
        <Descriptions.Item label={label} style={innerStyle}>
          {children}
          {extra != null ? (
            <div style={{ textAlign: "right" }}>{extra}</div>
          ) : undefined}
        </Descriptions.Item>
      </Descriptions>
    );
  }

  return vertical ? renderVertical() : renderHorizontal();
};
