import { render } from "./register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";

render({ type: "json" }, ({ field, obj }) => {
  const json = obj[field];
  if (!json) return null;
  return (
    <CodeMirrorStatic
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={JSON.stringify(obj[field], undefined, 2)}
      options={{ mode: infoToMode("js") }}
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
    <CodeMirrorStatic
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={JSON.stringify(parsed, undefined, 2)}
      options={{ mode: infoToMode("js") }}
    />
  );
});
