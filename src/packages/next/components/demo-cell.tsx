import { TAG_TO_FEATURE } from "@cocalc/util/db-schema/accounts";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext } from "@cocalc/frontend/lib/file-context";

interface DemoCellProps {
  tag: keyof typeof TAG_TO_FEATURE;
  style?: React.CSSProperties;
}

export default function DemoCell({
  tag,
  style = { maxWidth: "800px", margin: "auto" },
}: Readonly<DemoCellProps>) {
  const x = TAG_TO_FEATURE[tag];
  if (x == null) return null;
  const { language, welcome } = x;
  const value = "```" + language + "\n" + (welcome ?? "2+3") + "\n```\n";
  return (
    <FileContext.Provider value={{ jupyterApiEnabled: true }}>
      <Markdown value={value} style={style} />
    </FileContext.Provider>
  );
}
