import { TAGS_MAP } from "@cocalc/util/db-schema/accounts";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";

export default function DemoCell({ tag }) {
  const x = TAGS_MAP[tag];
  if (x == null) return null;
  const { language, welcome } = x;
  const value = "```" + language + "\n" + (welcome ?? "2+3") + "\n```\n";
  console.log(value);
  return (
    <FileContext.Provider value={{ jupyterApiEnabled: true }}>
      <Markdown value={value} style={{ maxWidth: "800px", margin: "auto" }} />
    </FileContext.Provider>
  );
}
