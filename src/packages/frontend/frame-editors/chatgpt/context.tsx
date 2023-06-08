import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";

const contextStyle = {
  overflowY: "auto",
  margin: "5px",
  padding: "5px",
  width: undefined,
} as const;

export default function Context({ value, info }) {
  if (!value?.trim()) {
    return (
      <b style={{ fontSize: "12pt" }}>
        No context from your file will be included.
      </b>
    );
  }
  if (info == "md" || info == "markdown") {
    return (
      <StaticMarkdown
        value={value}
        style={{
          ...contextStyle,
          border: "1px solid #ddd",
          borderRadius: "5px",
        }}
      />
    );
  } else {
    return (
      <CodeMirrorStatic
        style={contextStyle}
        options={{
          mode: infoToMode(info),
        }}
        value={value}
      />
    );
  }
}
