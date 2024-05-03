/*
A generic button for helping a user fix problems using chatgpt.
If chatgpt is disabled or not available it renders as null.
*/

import { Alert, Button } from "antd";
import { CSSProperties, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { RawPrompt } from "@cocalc/frontend/jupyter/llm/raw-prompt";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import type { ProjectsStore } from "@cocalc/frontend/projects/store";
import { trunc, trunc_left, trunc_middle } from "@cocalc/util/misc";
import LLMSelector, { modelToMention, modelToName } from "./llm-selector";
import shortenError from "./shorten-error";

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
  const projectsStore: ProjectsStore = redux.getStore("projects");
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);

  if (
    redux == null ||
    !projectsStore.hasLanguageModelEnabled(project_id, "help-me-fix")
  ) {
    return null;
  }

  const inputText = createMessage({
    error: get(error),
    task,
    input: get(input),
    language,
    extraFileInfo,
    prioritizeLastInput,
    model,
    open: true,
    full: false,
  });

  useAsyncEffect(async () => {
    // compute the number of tokens (this MUST be a lazy import):
    const { getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );

    setTokens(numTokensUpperBound(inputText, getMaxTokens(model)));
  }, [model, inputText]);

  return (
    <div>
      <PopconfirmKeyboard
        icon={<AIAvatar size={20} />}
        title={
          <>
            Get Help from{" "}
            <LLMSelector
              model={model}
              setModel={setModel}
              project_id={project_id}
            />
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
            <RawPrompt input={inputText} />
            <LLMCostEstimation
              model={model}
              tokens={tokens}
              type="secondary"
              paragraph
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
          <AIAvatar
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

interface GetHelpOpts {
  project_id: string;
  path: string;
  tag?: string;
  error: string;
  input?: string;
  task?: string;
  language?: string;
  extraFileInfo?: string;
  redux;
  prioritizeLastInput?: boolean;
  model: string;
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
}: GetHelpOpts) {
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
    tag: `help-me-fix${tag ? `:${tag}` : ""}`,
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
  full = true,
}): string {
  const message: string[] = [];
  message.push(
    `${full ? modelToMention(model) + " " : ""}Help me fix my code.`,
  );
  if (full)
    message.push(`<details${open ? " open" : ""}><summary>Context</summary>`);

  if (task) {
    message.push(`I ${task}.`);
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

  message.push(`I received the following error:`);
  message.push(`\`\`\`${language}\n${error}\n\`\`\``);

  // We put the input last, since it could be huge and get truncated.
  // It's much more important to show the error, obviously.
  if (input) {
    if (input.length < CUTOFF) {
      message.push(`My ${extraFileInfo ?? ""} contains:`);
    } else {
      if (prioritizeLastInput) {
        input = trunc_left(input, CUTOFF);
      } else {
        input = trunc(input, CUTOFF);
      }
      message.push(
        `My ${
          extraFileInfo ?? ""
        } code starts as follows, but is too long to fully include here:`,
      );
    }
    message.push(`\`\`\`${language}\n${input}\n\`\`\``);
  }

  if (full) message.push("</details>");

  return message.join("\n\n");
}
