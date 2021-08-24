/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { Slider, InputNumber, Row, Col } from "antd";
interface Props {
  value: number;
  onChange: (number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}

export const SliderWithInput: React.FC<Props> = React.memo(
  ({ value, onChange, min, max, disabled }) => {
    return (
      <Row>
        <Col span={4}>
          <InputNumber
            disabled={disabled}
            min={min}
            max={max}
            style={{ margin: "0 16px" }}
            value={value >= min && value <= max ? value : min}
            onChange={onChange}
          />
        </Col>
        <Col span={12}>
          <Slider
            disabled={disabled}
            min={min}
            max={max}
            onChange={onChange}
            value={value >= min && value <= max ? value : min}
          />
        </Col>
      </Row>
    );
  }
);
