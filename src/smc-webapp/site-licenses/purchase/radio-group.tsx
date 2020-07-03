/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Convenience function, mainly to make it easier to make vertical radio components,
// since that's sligthtly awkward with antd.

import { React, CSS } from "../../app-framework";
import { Radio } from "antd";

interface Props {
  disabled?: boolean;
  options: { label: string; value: any; disabled?: boolean; desc?: string }[];
  onChange: (e) => void;
  value?: any;
  radioStyle?: CSS;
}

export const RadioGroup: React.FC<Props> = ({
  disabled,
  options,
  onChange,
  value,
  radioStyle,
}) => {
  const v: JSX.Element[] = [];
  for (const x of options) {
    v.push(
      <Radio
        style={radioStyle}
        value={x.value}
        disabled={x.disabled}
        key={x.value}
      >
        <b>{x.label}</b>
        {x.desc ? " - " + x.desc : undefined}
      </Radio>
    );
  }

  return (
    <Radio.Group onChange={onChange} value={value} disabled={disabled}>
      {v}
    </Radio.Group>
  );
};
