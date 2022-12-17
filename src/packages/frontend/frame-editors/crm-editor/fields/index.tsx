import { cmp, cmp_Date } from "@cocalc/util/cmp";
import { ReactNode } from "react";
import { SCHEMA, RenderSpec, FieldSpec } from "@cocalc/util/db-schema";
import { fieldToLabel } from "../util";
import { A } from "@cocalc/frontend/components";
import { redux } from "@cocalc/frontend/app-framework";
import { getRegisteredRenderer } from "./register";

function getRender(field: string, spec: RenderSpec) {
  try {
    const C = getRegisteredRenderer(spec);
    return ({ obj }) => <C field={field} obj={obj} />;
  } catch (_err) {
    // todo  migrate everything to above asap.
  }

  if (spec.type == "project_link") {
    return ({ obj }) => (
      <a
        onClick={() =>
          redux
            .getActions("projects")
            .open_project({ project_id: obj[spec.project_id ?? field] })
        }
      >
        {obj[field]}
      </a>
    );
  }
  if (spec.type == "email_address") {
    return ({ obj }) => <A href={`mailto:${obj[field]}`}>{obj[field]}</A>;
  }

  return ({ obj }) => (
    <div>{obj[field] != null ? JSON.stringify(obj[field]) : ""}</div>
  );
}

function getSorter(field: string, renderSpec: RenderSpec) {
  if (renderSpec.type == "timestamp") {
    return (obj1, obj2) => cmp_Date(obj1[field], obj2[field]);
  }
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

function getWidth(renderSpec: RenderSpec): number | string | undefined {
  if (renderSpec.type == "account") {
    return 64;
  }
  if (renderSpec.type == "uuid") {
    return 300;
  }
  if (renderSpec.type == "timestamp") {
    return 250;
  }
  if (renderSpec.type == "markdown") {
    return 400;
  }
  if (renderSpec["ellipsis"]) {
    return renderSpec["width"] ?? 200;
  }
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
