/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import * as misc from "@cocalc/util/misc";
import { Form, Select } from "antd";
const { Option } = Select;

interface Props {
  options:
    | string[]
    | { value: string; display: JSX.Element | string }[]
    | { [keys: string]: JSX.Element }
    | Readonly<{ [keys: string]: string }>;
  disabled?: boolean;
  selected?: string;
  on_change?: (selected: string) => void;
  style?: React.CSSProperties;
  showSearch?: boolean;
}

// If the first element is a string, we assume the rest to be a string
function isStringArrayHeuristic(a: any): a is string[] {
  return typeof a[0] === "string";
}

export const SelectorInput: React.FC<Props> = (props: Props) => {
  const {
    options,
    disabled = false,
    selected,
    on_change,
    style,
    showSearch = false,
  } = props;

  function onChange(value) {
    if (typeof on_change === "function") {
      on_change(value);
    }
  }

  function renderStringArray(options): JSX.Element[] {
    return options.map((val, idx) => (
      <Option key={idx} value={val}>
        {val}
      </Option>
    ));
  }

  function renderDisplayArray(options): JSX.Element[] {
    return options.map((x) => (
      <Option key={x.value} value={x.value}>
        {x.display}
      </Option>
    ));
  }

  function renderDictionary(options): JSX.Element[] {
    const v = misc.keys(options);
    v.sort();
    return v.map((value) => (
      <Option key={value} value={value}>
        {options[value]}
      </Option>
    ));
  }

  function render_options(): JSX.Element[] {
    if (Array.isArray(options)) {
      if (isStringArrayHeuristic(options)) {
        return renderStringArray(options);
      } else {
        return renderDisplayArray(options);
      }
    } else {
      return renderDictionary(options);
    }
  }

  // if we search, we go through the displayed contents of the children, not the values
  // https://ant.design/components/select/#components-select-demo-option-label-prop
  function searchProps() {
    if (!showSearch) return {};
    return {
      showSearch: true,
      optionFilterProp: "children",
      filterOption: (input, option) =>
        option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0,
    };
  }

  return (
    <Form>
      <Form.Item style={style}>
        <Select
          {...searchProps()}
          defaultValue={selected}
          onChange={onChange}
          disabled={disabled}
        >
          {render_options()}
        </Select>
      </Form.Item>
    </Form>
  );
};
