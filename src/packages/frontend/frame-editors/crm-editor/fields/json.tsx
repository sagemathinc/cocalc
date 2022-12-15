import { register } from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

register({ type: "json" }, ({ field, obj }) => {
  const json = obj[field];
  if (!json) return null;
  return (
    <StaticMarkdown
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={"```js\n" + JSON.stringify(obj[field], undefined, 2) + "\n```"}
    />
  );
});
