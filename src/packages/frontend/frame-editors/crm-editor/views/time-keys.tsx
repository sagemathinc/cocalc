import { SCHEMA } from "@cocalc/util/db-schema";
import { CSSProperties, useMemo } from "react";
import { Select } from "antd";
import { fieldToLabel } from "../util";

interface Props {
  onChange: (key: string) => void;
  query: object;
  style: CSSProperties;
}

export function SelectTimeKey({ onChange, query, style }: Props) {
  const keys = useMemo(() => allTimeKeys(query), [query]);
  const options = keys.map((key) => {
    return { value: key, label: fieldToLabel(key) };
  });
  return (
    <Select
      defaultValue={keys[0]}
      onChange={onChange}
      options={options}
      style={{ width: "150px", ...style }}
    />
  );
}

function allTimeKeys(query: object) {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  const v: string[] = [];
  for (const key in query[table][0]) {
    if (
      schema.fields[key].type == "timestamp" &&
      query[table][0][key] !== undefined
    ) {
      v.push(key);
    }
  }
  return v;
}

export function defaultTimeKey(query: object): string | undefined {
  const table = Object.keys(query)[0];
  const schema = SCHEMA[table];
  for (const key in query[table][0]) {
    if (
      schema.fields[key].type == "timestamp" &&
      query[table][0][key] !== undefined
    ) {
      return key;
    }
  }
}
