/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { redux } from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon, Text } from "@cocalc/frontend/components";
import { useProjectContext } from "../project/context";
import { ChatActions } from "./actions";
import { ChatMessageTyped, Feedback } from "./types";

interface FeedackLLMProps {
  actions?: ChatActions;
  message: ChatMessageTyped;
}

export function FeedbackLLM({ actions, message }: FeedackLLMProps) {
  const { onCoCalcCom } = useProjectContext();

  if (actions == null) return null;
  const account_id = redux.getStore("account").get_account_id();

  //const date = message.get("date")?.getTime() ?? 0;
  const val = message.getIn(["feedback", account_id]);

  function feedback(what: Feedback) {
    return `Give ${what} feedback about this answer written by the language model.`;
  }

  const isNegative = val === "negative";
  const isPositive = val === "positive";

  function renderUnhappy() {
    if (!isNegative) return null;

    return (
      <>
        <Text type="secondary">
          Try another model!{" "}
          <HelpIcon title={"Different Language Models"}>
            Try a different language models by selecting it in the "Regenerate"
            dropdown or pick another one the next time you query it. No language
            model is like another one and answers vary from one another.{" "}
            {onCoCalcCom ? (
              <>
                In particular, there is a significant difference between free
                and paid models. Paid models are more expensive, because they
                process the information with a larger model, using more
                computational resources. They usually have a deeper
                understanding and are more accurate than free models.
              </>
            ) : undefined}
          </HelpIcon>
        </Text>
      </>
    );
  }

  return (
    <Space size="small" wrap>
      <Space>
        <Button
          style={{ color: "#555" }}
          size="small"
          type={isPositive ? "dashed" : "text"}
          onClick={() =>
            actions?.feedback(message, isPositive ? null : "positive")
          }
          title={feedback("positive")}
        >
          <Icon name="thumbs-up" />
        </Button>
        <Button
          style={{ color: "#555" }}
          size="small"
          type={isNegative ? "dashed" : "text"}
          onClick={() =>
            actions?.feedback(message, isNegative ? null : "negative")
          }
          title={feedback("negative")}
        >
          <Icon name="thumbs-down" />
        </Button>
      </Space>
      {renderUnhappy()}
    </Space>
  );
}
