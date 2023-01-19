import { render } from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

render({ type: "json" }, ({ field, obj }) => {
  const json = obj[field];
  if (!json) return null;
  return (
    <StaticMarkdown
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={"```js\n" + JSON.stringify(obj[field], undefined, 2) + "\n```"}
    />
  );
});

render({ type: "json-string" }, ({ field, obj }) => {
  const json = obj[field];
  if (!json) return null;
  let parsed;
  try {
    parsed = JSON.parse(obj[field]);
  } catch (_) {
    parsed = obj[field];
  }
  return (
    <StaticMarkdown
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={"```js\n" + JSON.stringify(parsed, undefined, 2) + "\n```"}
    />
  );
});
