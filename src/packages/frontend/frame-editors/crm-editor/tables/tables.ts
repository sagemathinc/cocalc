import { ReactNode, useMemo } from "react";
import { antdColumn, ColumnsType } from "../fields";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as defaults from "./defaults";
import { SCHEMA } from "@cocalc/util/db-schema";
import type { IconName } from "@cocalc/frontend/components/icon";

import "./tasks";
import "./people";
import "./leads";
import "./organizations";
import "./tags";
import "./support-tickets";
import "./support-messages";
import "./client-error-log";
import "./central-log";
import "./file-access-log";
import "./file-use";
import "./accounts";
import "./auth-tokens";
import "./messages";
import "./agents";
import "./patches";
import "./projects";
import "./project-log";
import "./public-paths";
import "./purchases";
import "./purchase-quotas";
import "./shopping-cart-items";
import "./statements";
import "./subscriptions";
import "./syncstrings";
import "./vouchers";
import "./openai";
import "./analytics";
import "./retention";

interface TableDescription {
  name: string;
  title: ReactNode;
  icon?: IconName; // todo: render this..
  query: object;
  columns: ColumnsType[];
  allowCreate?: boolean;
  changes?: boolean;
  timeKey?: string;
  createDefaults?: object;
  updateDefaults?: object;
  retention?: boolean;
  __templates?: boolean; // set after we fill in any templates.
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
  fillInTemplates(desc);
  return desc;
}

export function useTableDescription(name: string) {
  return useMemo(() => getTableDescription(name), [name]);
}

export function getDBTableDescription(dbtable: string): TableDescription {
  for (const name in tables) {
    if (dbtable == Object.keys(tables[name].query)[0]) {
      return getTableDescription(name);
    }
  }
  throw Error(`unknown dbtable ${dbtable}`);
}

export function getTables(): string[] {
  return Object.keys(tables ?? {});
}

function fillInTemplates(desc) {
  if (desc.__templates) return;

  const dbtable = Object.keys(desc.query)[0];

  // generic defaults defined by the field name:
  for (const x of ["createDefaults", "updateDefaults"]) {
    for (const field in defaults[x]) {
      if (SCHEMA[dbtable].user_query?.set?.fields?.[field] != null) {
        // it is a settable field
        if (desc[x] == null) {
          desc[x] = { [field]: defaults[x][field] };
        } else {
          // do not overwrite any existing settings
          if (desc[x][field] === undefined) {
            desc[x][field] = defaults[x][field];
          }
        }
      }
    }
  }

  // specialized defaults/overrides for this particular table, if any:
  for (const field of ["createDefaults", "updateDefaults"]) {
    const x = desc[field];
    if (x != null) {
      for (const key in x) {
        if (x[key] == "[account_id]") {
          x[key] = webapp_client.account_id;
        } else if (x[key] === null) {
          // Explicitly disabling defaults for this key. This
          // is used to not do something from defaults.ts.
          delete x[key];
        }
      }
    }
  }

  desc.__templates = true;
}
