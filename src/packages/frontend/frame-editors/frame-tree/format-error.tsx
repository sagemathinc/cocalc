// A dismissable error message that appears when formatting code.

import { useMemo } from "react";
import { Alert, Button } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import HelpMeFix from "@cocalc/frontend/frame-editors/chatgpt/help-me-fix";
import { file_associations } from "@cocalc/frontend/file-associations";

interface Props {
  formatError: string;
  formatInput?: string;
}

export default function FormatError({ formatError, formatInput }: Props) {
  const { actions } = useFrameContext();
  const language = useMemo(() => actions?.chatgptGetLanguage(), [actions]);
  const mode = useMemo(
    () => file_associations[language]?.opts?.mode ?? language,
    [language]
  );

  if (actions == null) return null;

  return (
    <Alert
      style={{
        padding: "5px",
        margin: "5px",
      }}
      closable
      type="info"
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
              extraFileInfo={actions.chatgptExtraFileInfo()}
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
        </div>
      }
      onClose={() => actions.setFormatError("")}
    />
  );
}
