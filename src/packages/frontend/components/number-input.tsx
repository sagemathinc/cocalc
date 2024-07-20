/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { Col, Row, Input } from "antd";

interface Props {
  number: number;
  min?: number;
  max?: number;
  on_change: (n: number) => void;
  unit?: string;
  disabled?: boolean;
}

export function NumberInput(props: Props) {
  const [number, setNumber] = useState<string>(`${props.number}`);

  useEffect(() => {
    setNumber(`${number}`);
  }, [props.number]);

  function saveChange(e?) {
    e?.preventDefault();
    let m = parseInt(number);
    if (!isFinite(m)) {
      m = props.number;
    }
    if (props.min != null && m < props.min) {
      m = props.min;
    } else if (props.max != null && m > props.max) {
      m = props.max;
    }
    setNumber(`${m}`);
    props.on_change(m);
  }

  return (
    <Row gutter={16}>
      <Col xs={16}>
        <Input
          type="text"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={saveChange}
          onKeyDown={(e) => {
            if (e.keyCode === 27) {
              // reset back to its original value.
              setNumber(`${props.number}`);
            } else if (e.keyCode === 13) {
              saveChange();
            }
          }}
          disabled={props.disabled}
        />
      </Col>
      <Col xs={8} className="lighten">
        {props.unit ? `${props.unit}` : ""}
      </Col>
    </Row>
  );
}
