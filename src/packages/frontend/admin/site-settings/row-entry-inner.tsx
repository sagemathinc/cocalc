/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input, Select } from "antd";
import { CSSProperties } from "react";
import Password, {
  PasswordTextArea,
} from "@cocalc/frontend/components/password";
import { ConfigValid } from "@cocalc/util/db-schema/site-defaults";

export function rowEntryStyle(value, valid?: ConfigValid): CSSProperties {
  if (
    (Array.isArray(valid) && !valid.includes(value)) ||
    (typeof valid == "function" && !valid(value))
  ) {
    return { border: "2px solid red" };
  }
  return {};
}

export function RowEntryInner({
  name,
  value,
  valid,
  password,
  multiline,
  onChangeEntry,
  isReadonly,
  clearable,
  update,
}) {
  if (isReadonly == null) return null; // typescript
  const disabled = isReadonly[name] == true;

  if (Array.isArray(valid)) {
    return (
      <Select
        defaultValue={value}
        disabled={disabled}
        onChange={(value) => {
          onChangeEntry(name, value);
          update();
        }}
        style={{ width: "100%" }}
        options={valid.map((e) => {
          return { value: e, label: e };
        })}
      />
    );
  } else {
    if (password) {
      if (multiline != null) {
        return (
          <PasswordTextArea
            rows={multiline}
            autoComplete="off"
            style={rowEntryStyle(value, valid)}
            defaultValue={value}
            visibilityToggle={true}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
          />
        );
      } else {
        return (
          <Password
            autoComplete="off"
            style={rowEntryStyle(value, valid)}
            defaultValue={value}
            visibilityToggle={true}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
          />
        );
      }
    } else {
      if (multiline != null) {
        const style = {
          ...rowEntryStyle(value, valid),
          fontFamily: "monospace",
          fontSize: "80%",
        } as CSSProperties;
        return (
          <Input.TextArea
            autoComplete="off"
            rows={multiline}
            style={style}
            defaultValue={value}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
          />
        );
      } else {
        return (
          <Input
            autoComplete="off"
            style={rowEntryStyle(value, valid)}
            defaultValue={value}
            disabled={disabled}
            onChange={(e) => onChangeEntry(name, e.target.value)}
            allowClear={clearable}
          />
        );
      }
    }
  }
}
