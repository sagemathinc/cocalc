// A dismissable error message that appears when formatting code.

import { Alert, Button } from "antd";
import { useMemo } from "react";

import { file_associations } from "@cocalc/frontend/file-associations";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { Ansi, is_ansi } from "@cocalc/frontend/jupyter/output-messages/ansi";

interface Props {
  formatError: string;
  formatInput?: string;
}

export default function FormatError({ formatError, formatInput }: Props) {
  const { actions } = useFrameContext();
  const language = useMemo(
    () => actions?.languageModelGetLanguage(),
    [actions],
  );
  const mode = useMemo(
    () => file_associations[language]?.opts?.mode ?? language,
    [language],
  );

  if (actions == null) return null;

  return (
    <div style={{ borderTop: "1px solid #ddd" }}>
      <Alert
        banner
        style={{
          padding: "5px",
        }}
        closable
        type="warning"
        description={
          <div style={{ width: "100%", display: "flex" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                margin: "0 15px",
              }}
            >
              <HelpMeFix
                size="large"
                style={{ width: "100%" }}
                task={"ran a code formatter"}
                error={formatError}
                input={formatInput}
                language={language}
                extraFileInfo={actions.languageModelExtraFileInfo()}
                tag={"format"}
              />
              <div style={{ height: "15px" }} />
              <Button
                size="large"
                style={{ width: "100%" }}
                onClick={() => actions.setFormatError("")}
              >
                Close
              </Button>
            </div>
            {is_ansi(formatError) ? (
              // NOTE: depending on prettier etc config and host (e.g., compute server),
              // the formatError might be full of ansi codes or not, so if it is, then
              // we render it as such; otherwise we use codemirror.  Don't just get rid of
              // this not realizing that ansi or not is subtle and depends on the formatter's
              // environment in ways I don't understand...
              <div style={{ whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                <Ansi>{formatError}</Ansi>
              </div>
            ) : (
              <CodeMirrorStatic
                style={{
                  padding: "15px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  flex: 1,
                }}
                value={formatError}
                options={{ mode }}
              />
            )}
          </div>
        }
        onClose={() => actions.setFormatError("")}
      />
    </div>
  );
}
