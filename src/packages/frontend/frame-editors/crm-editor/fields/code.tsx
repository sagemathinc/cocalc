import { render } from "./register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";

render({ type: "code" }, ({ field, obj }) => {
  const code = obj[field];
  if (!code) return null;
  return (
    <CodeMirrorStatic
      value={code}
      options={{
        mode: infoToMode("", { value: code }),
      }}
    />
  );
});
