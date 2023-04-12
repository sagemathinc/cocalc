// A dismissable error message when formatting code

import { Alert, Button, Space } from "antd";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { filenameMode } from "@cocalc/frontend/file-associations";
import HelpMeFix from "@cocalc/frontend/frame-editors/chatgpt/help-me-fix";

interface Props {
  formatError: string;
}

export default function FormatError({ formatError }: Props) {
  const { actions, path } = useFrameContext();
  return (
    <Alert
      style={{ padding: "15px" }}
      closable
      type="warning"
      description={
        <div>
          <Space style={{ marginBottom: "5px" }}>
            <Button onClick={() => actions.setFormatError("")}>Close</Button>
            <HelpMeFix />
          </Space>
          <CodeMirrorStatic
            style={{ padding: "15px", maxHeight: "200px", overflowY: "auto" }}
            value={formatError}
            options={{
              mode: filenameMode(path),
            }}
          />
        </div>
      }
      onClose={() => actions.setFormatError("")}
    />
  );
}
