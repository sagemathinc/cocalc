import { ReactNode } from "react";
import { SCHEMA, Render } from "@cocalc/util/db-schema";

export function getRenderer(table: string, field: string) {
  const spec = getRenderSpec(table, field);
  console.log({ table, field, spec });
  return ({ obj }) => (
    <div>{obj[field] != null ? JSON.stringify(obj[field]) : ""}</div>
  );
}

// Returns function suitable for the render field of the antd table columns object:
export function tableRender(
  table: string,
  field: string
): (string, object) => ReactNode {
  const R = getRenderer(table, field);
  return (_, obj) => <R obj={obj} />;
}

function getRenderSpec(table: string, field: string): Render | null {
  const schema = SCHEMA[table];
  if (schema == null) {
    return null;
  }
  let render = schema.fields?.[field]?.render;
  if (render != null) return render;
  if (typeof schema.virtual == "string") {
    return SCHEMA[schema.virtual ?? ""]?.fields?.[field]?.render;
  }
  return null;
}
