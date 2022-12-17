import { ReactNode } from "react";
import { antdColumn } from "../fields";

import "./tasks";
import "./people";
import "./organizations";
import "./support-tickets";
import "./support-messages";

import "./site-licenses";
import "./accounts";
import "./projects";
import "./shopping-cart-items";
import "./syncstrings";

interface TableDescription {
  name: string;
  title: ReactNode;
  icon?: string; // todo: render this..
  query: object;
  columns: any[];
  expandable?: any; // todo -- same as for antd table
  allowCreate?: boolean;
  changes?: boolean;
  timeKey?: string;
}

let tables: { [name: string]: TableDescription };

export function register(desc: Partial<TableDescription>) {
  if (tables == null) {
    tables = {};
  }
  if (desc.columns == null) {
    desc.columns = [];
  }
  const known = new Set<string>();
  for (const c of desc.columns) {
    if (c.dataIndex) {
      known.add(c.dataIndex);
    }
  }
  if (desc.title == null) {
    throw Error("title must be specified");
  }
  if (desc.name == null) {
    throw Error("name must be specified");
  }
  if (desc.query == null) {
    throw Error("query must be specified");
  }
  const table = Object.keys(desc.query)[0];
  for (const field in desc.query[table][0]) {
    if (!known.has(field)) {
      desc.columns.push(antdColumn(table, field));
    }
  }
  if (desc.columns[0] != null) {
    desc.columns[0].fixed = "left";
  }
  tables[desc.name] = desc as TableDescription;
}

export function getTableDescription(name: string): TableDescription {
  const desc = tables[name];
  if (desc == null) {
    throw Error(`unknown table ${name}`);
  }
  return desc;
}

export function getTables(): string[] {
  return Object.keys(tables ?? {});
}
