/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input, Select } from "antd";
import { CSSProperties } from "react";

import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import Password, {
  PasswordTextArea,
} from "@cocalc/frontend/components/password";
import { modelToName } from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { USER_SELECTABLE_LANGUAGE_MODELS } from "@cocalc/util/db-schema/llm-utils";
import {
  ConfigValid,
  to_list_of_llms,
} from "@cocalc/util/db-schema/site-defaults";
import { RowEntryInnerProps } from "./row-entry";

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
}: RowEntryInnerProps) {
  if (isReadonly == null) return null; // typescript
  const disabled = isReadonly[name] == true;

  if (name === "selectable_llms") {
    return (
      <Select
        mode="multiple"
        style={{ width: "100%" }}
        placeholder="Select user selectable LLMs"
        optionLabelProp="label"
        defaultValue={to_list_of_llms(value, false)}
        onChange={(value: Array<string>) => {
          onChangeEntry(name, value.join(","));
          update();
        }}
        options={USER_SELECTABLE_LANGUAGE_MODELS.map((model) => {
          return { label: modelToName(model), value: model };
        })}
        optionRender={(option) => (
          <>
            <LanguageModelVendorAvatar model={(option.value as string) ?? ""} />{" "}
            {option.label}
          </>
        )}
      />
    );
  } else if (Array.isArray(valid)) {
    return (
      <Select
        defaultValue={value}
        disabled={disabled}
        onChange={(value) => {
          // should never happen, because this is not a "multiple" Select
          if (Array.isArray(value)) {
            console.warn(`Got array value for ${name}: ${value}`);
            return;
          }
          onChangeEntry(name, value);
          update();
        }}
        style={{ width: "100%" }}
        options={valid.map((value) => {
          const label = name === "default_llm" ? modelToName(value) : value;
          return { value, label };
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
