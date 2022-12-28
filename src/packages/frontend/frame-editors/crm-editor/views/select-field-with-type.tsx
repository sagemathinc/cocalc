import { SCHEMA } from "@cocalc/util/db-schema";
import { CSSProperties, useMemo } from "react";
import { Select } from "antd";
import { fieldToLabel } from "../util";

interface Props {
  onChange: (key: string) => void;
  query: object;
  style: CSSProperties;
  value: string;
  type: string;
  hiddenFields: Set<string>;
}

export function SelectField({
  onChange,
  query,
  style,
  value,
  type,
  hiddenFields,
}: Props) {
  const keys = useMemo(
    () => allFields(query, type, hiddenFields),
    [query, hiddenFields]
  );
  const options = keys.map((key) => {
    return { value: key, label: fieldToLabel(key) };
  });
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      style={{ width: "150px", ...style }}
    />
  );
}

function matches({ hiddenFields, type, schema, key }): boolean {
  return (
    !hiddenFields.has(key) &&
    (schema.fields[key].render?.type == type || schema.fields[key].type == type)
  );
}

function allFields(query: object, type: string, hiddenFields: Set<string>) {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  const v: string[] = [];
  for (const key in query[table][0]) {
    if (matches({ hiddenFields, type, schema, key })) {
      v.push(key);
    }
  }
  return v;
}

export function defaultField(
  query: object,
  type: string,
  hiddenFields: Set<string>
): string | undefined {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  for (const key in query[table][0]) {
    if (matches({ hiddenFields, type, schema, key })) {
      return key;
    }
  }
}
