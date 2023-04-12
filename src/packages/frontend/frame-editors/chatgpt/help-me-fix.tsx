/*
A generic button for helping a user fix problems using chatgpt.
If chatgpt is disabled or not available it renders as null.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
//import type { Actions } from "@cocalc/frontend/frame-editors/code-editor/action";
import { Alert, Button, Tooltip } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
//import getChatActions from "@cocalc/frontend/chat/get-actions";
import { redux } from "@cocalc/frontend/app-framework";
import { CSSProperties, useState } from "react";

interface Props {
  style?: CSSProperties;
  input?: string; // the input, e.g., code you ran
  context?: string; // additional relevant code or other context
  error?: string; // the error it produced
  task?: string; // what you're doing, e.g., "Editing the file foo.ts" or "Using a Jupyter notebook with kernel SageMath 9.8".
}

export default function HelpMeFix({
  input,
  context,
  error,
  task,
  style,
}: Props) {
  const { project_id, path } = useFrameContext();
  console.log({
    input,
    context,
    error,
    task,
    style,
    path,
  });
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [errorGettingHelp, setErrorGettingHelp] = useState<string>("");
  if (!redux.getStore("projects").hasOpenAI(project_id)) {
    return null;
  }
  return (
    <div>
      <Tooltip title="@ChatGPT, help fix this...">
        <Button
          style={style}
          disabled={gettingHelp}
          onClick={async () => {
            setGettingHelp(true);
            setErrorGettingHelp("");
            try {
              console.log("get help: TODO");
            } catch (err) {
              setErrorGettingHelp(`${err}`);
            } finally {
              setGettingHelp(false);
            }
          }}
        >
          <OpenAIAvatar
            size={16}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Help me fix this...
        </Button>
      </Tooltip>
      {errorGettingHelp && (
        <Alert
          style={{ maxWidth: "600px", margin: "15px 0" }}
          type="error"
          showIcon
          closable
          message={errorGettingHelp}
          onClick={() => setErrorGettingHelp("")}
        />
      )}
    </div>
  );
}
