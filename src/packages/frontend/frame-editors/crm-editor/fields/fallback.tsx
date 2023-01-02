import { render, sorter } from "./register";
import { RenderSpec } from "@cocalc/util/db-schema";
import { cmp } from "@cocalc/util/cmp";

// this coercion is a sort of hack:
render({} as RenderSpec, ({ field, obj }) => {
  const value = obj[field];
  return <div>{value != null ? JSON.stringify(value) : ""}</div>;
});

sorter({} as RenderSpec, () => cmp);
