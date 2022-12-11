import { ReactNode } from "react";

import "./accounts";
import "./organizations";
import "./people";
import "./shopping-cart-items";
import "./support-tickets";
import "./support-messages";
import "./tasks";

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
export function register(desc: TableDescription) {
  if (tables == null) {
    tables = {};
  }
  tables[desc.name] = desc;
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
