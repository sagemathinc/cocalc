import { register } from "./register";
import { RenderSpec } from "@cocalc/util/db-schema";

// this coercion is a sort of hack:
register({} as RenderSpec, ({ field, obj }) => {
  const value = obj[field];
  return <div>{value != null ? JSON.stringify(value) : ""}</div>;
});
