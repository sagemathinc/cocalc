/*
A generic button for helping a user fix problems using chatgpt.
If chatgpt is disabled or not available it renders as null.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Alert, Button } from "antd";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { CSSProperties, useState } from "react";
import { trunc, trunc_left, trunc_middle } from "@cocalc/util/misc";
import shortenError from "./shorten-error";
import ModelSwitch, { modelToMention, modelToName } from "./model-switch";
import type { Model } from "./model-switch";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  error: string | (() => string); // the error it produced. This is viewed as code.
  input?: string | (() => string); // the input, e.g., code you ran
  task?: string; // what you're doing, e.g., "ran a cell in a Jupyter notebook" or "ran a code formatter"
  tag?: string;
  language?: string;
  extraFileInfo?: string;
  style?: CSSProperties;
  size?;
  prioritizeLastInput?: boolean; // if true, when truncating input we keep the end rather than truncating the end.
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
  prioritizeLastInput,
}: Props) {
  const { redux, project_id, path } = useFrameContext();
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [errorGettingHelp, setErrorGettingHelp] = useState<string>("");
  const [model, setModel] = useState<Model>("gpt-3.5-turbo");
  if (
    redux == null ||
    !redux.getStore("projects").hasOpenAI(project_id, "help-me-fix")
  ) {
    return null;
  }
  return (
    <div>
      <PopconfirmKeyboard
        icon={<OpenAIAvatar size={20} />}
        title={
          <>
            Get Help from{" "}
            <ModelSwitch size="small" model={model} setModel={setModel} />
          </>
        }
        description={() => (
          <div
            style={{
              width: "450px",
              overflow: "auto",
              maxWidth: "90vw",
              maxHeight: "300px",
            }}
          >
            The following will be sent to {modelToName(model)}:
            <StaticMarkdown
              style={{
                border: "1px solid lightgrey",
                borderRadius: "5px",
                margin: "5px 0",
                padding: "5px",
              }}
              value={createMessage({
                error: get(error),
                task,
                input: get(input),
                language,
                extraFileInfo,
                prioritizeLastInput,
                model,
                open: true,
              })}
            />
          </div>
        )}
        okText={
          <>
            <Icon name={"paper-plane"} /> Ask {modelToName(model)} (enter)
          </>
        }
        onConfirm={async () => {
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
              prioritizeLastInput,
              model,
            });
          } catch (err) {
            setErrorGettingHelp(`${err}`);
          } finally {
            setGettingHelp(false);
          }
        }}
      >
        <Button size={size} style={style} disabled={gettingHelp}>
          <OpenAIAvatar
            size={16}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Help me fix this...
        </Button>
      </PopconfirmKeyboard>
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

export async function getHelp({
  project_id,
  path,
  tag,
  error,
  input = "",
  task = "",
  language = "",
  extraFileInfo = "",
  redux,
  prioritizeLastInput,
  model,
}) {
  const message = createMessage({
    error,
    language,
    input,
    model,
    task,
    extraFileInfo,
    prioritizeLastInput,
    open: false,
  });
  // scroll to bottom *after* the message gets sent.
  const actions = await getChatActions(redux, project_id, path);
  setTimeout(() => actions.scrollToBottom(), 100);
  await actions.send_chat({
    input: message,
    tag: `help-me-fix${tag ? ":" + tag : ""}`,
    noNotification: true,
  });
}

function createMessage({
  error,
  language,
  input,
  model,
  task,
  extraFileInfo,
  prioritizeLastInput,
  open,
}): string {
  let message = `${modelToMention(model)} help me fix my code.\n\n<details${
    open ? " open" : ""
  }><summary>Context</summary>\n\n`;

  if (task) {
    message += `\nI ${task}.\n`;
  }

  if (error.length > 3000) {
    // 3000 is about 500 tokens
    // This uses structure:
    error = shortenError(error, language);
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
      if (prioritizeLastInput) {
        input = trunc_left(input, CUTOFF);
      } else {
        input = trunc(input, CUTOFF);
      }
      message += `\nMy ${
        extraFileInfo ?? ""
      } code starts as follows, but is too long to fully include here:\n\n`;
    }
    message += `\`\`\`${language}\n${input}\n\`\`\`\n\n`;
  }

  message += "\n\n</details>\n\n";

  return message;
}
