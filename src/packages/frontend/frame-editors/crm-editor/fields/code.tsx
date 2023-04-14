import { render } from "./register";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import detectLanguage from "@cocalc/frontend/misc/detect-language";

render({ type: "code" }, ({ field, obj }) => {
  const code = obj[field];
  if (!code) return null;
  return (
    <StaticMarkdown
      style={{ maxHeight: "10em", overflow: "auto" }}
      value={"```" + `${detectLanguage(code)}\n${code}` + "\n```"}
    />
  );
});
