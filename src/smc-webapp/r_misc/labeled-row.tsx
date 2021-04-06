/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Row, Col } from "antd";

interface Props {
  label_cols?: number;
  label?: string | React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
}

export const LabeledRow: React.FC<Props> = ({
  children,
  style,
  label,
  className,
  label_cols = 4,
}) => {
  return (
    <Row style={style} className={className}>
      <Col span={2 * label_cols} style={{ marginTop: "8px" }}>
        {label}
      </Col>
      <Col span={24 - 2 * label_cols} style={{ marginTop: "8px" }}>
        {children}
      </Col>
    </Row>
  );
};
