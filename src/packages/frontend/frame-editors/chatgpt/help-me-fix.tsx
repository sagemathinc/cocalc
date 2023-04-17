/*
A generic button for helping a user fix problems using chatgpt.
If chatgpt is disabled or not available it renders as null.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Alert, Button, Tooltip } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { CSSProperties, useState } from "react";
import { trunc, trunc_middle } from "@cocalc/util/misc";
//import shortenError from "./shorten-error";

interface Props {
  error: string | (() => string); // the error it produced. This is viewed as code.
  input?: string | (() => string); // the input, e.g., code you ran
  task?: string; // what you're doing, e.g., "ran a cell in a Jupyter notebook" or "ran a code formatter"
  tag?: string;
  language?: string;
  extraFileInfo?: string;
  style?: CSSProperties;
  size?;
}

function get(f: undefined | string | (() => string)): string {
  if (f == null) return "";
  if (typeof f == "string") return f;
  return f();
}

export default function HelpMeFix({
  error,
  task,
  input,
  tag,
  language,
  extraFileInfo,
  style,
  size,
}: Props) {
  const { redux, project_id, path } = useFrameContext();
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [errorGettingHelp, setErrorGettingHelp] = useState<string>("");
  if (redux == null || !redux.getStore("projects").hasOpenAI(project_id)) {
    return null;
  }
  return (
    <div>
      <Tooltip title="@ChatGPT, help fix this..." placement={"right"}>
        <Button
          size={size}
          style={style}
          disabled={gettingHelp}
          onClick={async () => {
            setGettingHelp(true);
            setErrorGettingHelp("");
            try {
              await getHelp({
                project_id,
                path,
                error: get(error),
                task,
                input: get(input),
                tag,
                language,
                extraFileInfo,
                redux,
              });
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

const CUTOFF = 3000;

async function getHelp({
  project_id,
  path,
  tag,
  error,
  input = "",
  task = "",
  language = "",
  extraFileInfo = "",
  redux,
}) {
  let message =
    '<span class="user-mention" account-id=chatgpt>@ChatGPT</span> help me fix my code.\n\n<details>\n\n';

  if (task) {
    message += `\nI ${task}.\n`;
  }

  if (error.length > 3000) {
    // 3000 is about 500 tokens
    // This uses structure:
    //error = shortenError(error);
    // for now JUST do this:
    if (error.length > 3000) {
      // this just puts ... in the middle.
      error = trunc_middle(error, 3000);
    }
  }

  message += `\nI received the following error:\n\n`;
  message += `\`\`\`${language}\n${error}\n\`\`\`\n\n`;

  // We put the input last, since it could be huge and get truncated.
  // It's much more important to show the error, obviously.
  if (input) {
    if (input.length < CUTOFF) {
      message += `\nMy ${extraFileInfo ?? ""} contains:\n\n`;
    } else {
      input = trunc(input, CUTOFF);
      message += `\nMy ${
        extraFileInfo ?? ""
      } code starts as follows, but is too long to fully include here:\n\n`;
    }
    message += `\`\`\`${language}\n${input}\n\`\`\`\n\n`;
  }

  message += "\n\n</details>\n\n";

  // scroll to bottom *after* the message gets sent.
  const actions = await getChatActions(redux, project_id, path);
  setTimeout(() => actions.scrollToBottom(), 100);
  await actions.send_chat(
    message,
    undefined,
    undefined,
    `help-me-fix${tag ? ":" + tag : ""}`
  );
}
