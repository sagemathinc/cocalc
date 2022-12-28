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
}

export function SelectField({ onChange, query, style, value, type }: Props) {
  const keys = useMemo(() => allFields(query, type), [query]);
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

function matches({ query, table, type, schema, key }): boolean {
  return (
    schema.fields[key].render?.type == type || schema.fields[key].type == type
  );
}

function allFields(query: object, type: string) {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  const v: string[] = [];
  for (const key in query[table][0]) {
    if (matches({ query, table, type, schema, key })) {
      v.push(key);
    }
  }
  return v;
}

export function defaultField(query: object, type: string): string | undefined {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  for (const key in query[table][0]) {
    if (matches({ query, table, type, schema, key })) {
      return key;
    }
  }
}
