import { ReactNode } from "react";
import { SCHEMA, RenderSpec, FieldSpec } from "@cocalc/util/db-schema";
import { fieldToLabel } from "../util";
import * as register from "./register";

import "./accounts";
import "./boolean";
import "./email-address";
import "./fallback";
import "./image";
import "./json";
import "./markdown";
import "./percent";
import "./project-link";
import "./purchased";
import "./text";
import "./timestamp";
import "./uuid";

function getRender(field: string, spec: RenderSpec) {
  const C = register.getRenderer(spec);
  return ({ obj }) => <C field={field} obj={obj} />;
}

function getSorter(field: string, renderSpec: RenderSpec) {
  const cmp = register.getSorter(renderSpec);
  return (obj1, obj2) => cmp(obj1[field], obj2[field]);
}

function getTitle(field: string, fieldSpec: FieldSpec): string {
  return fieldSpec.title ?? fieldToLabel(field);
}

export function antdColumn(
  table: string,
  field: string
): {
  title: string;
  dataIndex: string;
  key: string;
  sorter?: (obj1: object, obj2: object) => number;
  render: (text: string, obj: object) => ReactNode;
  ellipsis?: boolean;
  width?: number | string;
} {
  const fieldSpec = getFieldSpec(table, field);
  const renderSpec = getRenderSpec(fieldSpec);
  const Renderer = getRender(field, renderSpec);
  return {
    title: getTitle(field, fieldSpec),
    dataIndex: field,
    key: field,
    sorter: getSorter(field, renderSpec),
    render: (_, obj) => <Renderer obj={obj} />,
    width: getWidth(renderSpec),
    ellipsis: renderSpec["ellipsis"],
  };
}

function getWidth(renderSpec: RenderSpec): number | string {
  if (renderSpec.type == "account") {
    return 64;
  }
  if (renderSpec.type == "uuid") {
    return 300;
  }
  if (renderSpec.type == "text") {
    return 300;
  }
  if (renderSpec.type == "timestamp") {
    return 150;
  }
  if (renderSpec.type == "percent") {
    return 150;
  }
  if (renderSpec.type == "usersmap") {
    return 250;
  }
  if (renderSpec.type == "markdown") {
    return renderSpec.editable ? 800 : 400;
  }
  if (renderSpec["ellipsis"]) {
    return renderSpec["width"] ?? 200;
  }
  return 100;
}

function getFieldSpec(table: string, field: string): FieldSpec {
  const schema = SCHEMA[table];
  if (schema == null) {
    throw Error(`invalid table ${table}`);
  }
  let spec = schema.fields?.[field];
  if (spec != null && typeof spec != "boolean" && typeof spec.type != "boolean")
    return spec;
  if (typeof schema.virtual == "string") {
    spec = SCHEMA[schema.virtual ?? ""]?.fields?.[field];
    if (spec != null) return spec;
  }
  throw Error(`invalid db-schema spec for field ${field} of table ${table}`);
}

function getRenderSpec(fieldSpec: FieldSpec): RenderSpec {
  let renderSpec = fieldSpec.render;
  if (renderSpec != null) {
    return renderSpec;
  }

  if (typeof fieldSpec.type == "boolean") {
    throw Error("bug");
  }

  // try to determine from type, which must be specified and must be one
  // of these (unless somebody adds to db-schema/types.ts):
  switch (fieldSpec.type) {
    case "uuid":
      return { type: "uuid" };
    case "timestamp":
      return { type: "timestamp" };
    case "string":
      return { type: "text" };
    case "boolean":
      return { type: "boolean" };
    case "map":
      return { type: "json" };
    case "array":
      if (fieldSpec.pg_type?.toLowerCase() == "text[]") {
        return { type: "array", ofType: "text" };
      } else {
        return { type: "array", ofType: "json" };
      }
    case "integer":
      return { type: "number", integer: true };
    case "number":
      return { type: "number" };
    case "Buffer":
      return { type: "blob" };
    default:
      // this should be impossible due to typescript...
      throw Error(`invalid field type ${fieldSpec.type}`);
  }
}
