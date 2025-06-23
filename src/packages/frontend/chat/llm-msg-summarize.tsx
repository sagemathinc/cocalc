/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Collapse, Switch } from "antd";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { useAsyncEffect, useState } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, RawPrompt, Tip } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { COLORS } from "@cocalc/util/theme";
import { ChatActions } from "./actions";
import { ChatMessageTyped } from "./types";

export function SummarizeThread({
  message,
  actions,
}: {
  message: ChatMessageTyped;
  actions?: ChatActions;
}) {
  const reply_to = message.get("reply_to");
  const { project_id } = useProjectContext();
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [visible, setVisible] = useState(false);
  const [tokens, setTokens] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [short, setShort] = useState(true);
  const [prompt, setPrompt] = useState<string>("");

  useAsyncEffect(async () => {
    // we do no do all the processing if the popconfirm is not visible
    if (!visible) return;

    const info = await actions?.summarizeThread({
      model,
      reply_to,
      returnInfo: true,
      short,
    });

    if (!info) return;
    const { tokens, truncated, prompt } = info;
    setTokens(tokens);
    setTruncated(truncated);
    setPrompt(prompt);
  }, [visible, model, message, short]);

  return (
    <PopconfirmKeyboard
      onVisibilityChange={setVisible}
      icon={<AIAvatar size={16} />}
      title={<>Summarize this thread</>}
      description={() => (
        <div style={{ maxWidth: "500px" }}>
          <Paragraph>
            <LLMSelector model={model} setModel={setModel} />
          </Paragraph>
          <Paragraph>
            The conversation in this thread will be sent to the language model{" "}
            {modelToName(model)}. It will then start a new thread and reply with
            a {short ? "short" : "detailed"} summary of the conversation.
          </Paragraph>
          <Paragraph>
            Summary length:{" "}
            <Switch
              checked={!short}
              onChange={(v) => setShort(!v)}
              unCheckedChildren={"short"}
              checkedChildren={"detailed"}
            />
          </Paragraph>
          {truncated ? (
            <Paragraph type="warning">
              The conversion will be truncated. Consider selecting another
              language model with a larger context window.
            </Paragraph>
          ) : null}
          <Collapse
            items={[
              {
                key: "1",
                label: (
                  <>Click to see what will be sent to {modelToName(model)}.</>
                ),
                children: (
                  <RawPrompt
                    input={prompt}
                    style={{ border: "none", padding: "0", margin: "0" }}
                  />
                ),
              },
            ]}
          />
          <LLMCostEstimation
            model={model}
            tokens={tokens}
            paragraph={true}
            type="secondary"
            maxOutputTokens={short ? 200 : undefined}
          />
        </div>
      )}
      onConfirm={() => actions?.summarizeThread({ model, reply_to, short })}
      okText="Summarize"
    >
      <Tip
        placement={"bottom"}
        title={"Summarize this thread using a language model."}
      >
        <Button type="text" style={{ color: COLORS.GRAY_M }}>
          <Icon name="vertical-align-middle" /> Summarize…
        </Button>
      </Tip>
    </PopconfirmKeyboard>
  );
}
