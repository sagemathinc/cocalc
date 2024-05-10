/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Space } from "antd";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import { ChatActions } from "./actions";
import { ChatMessageTyped, Feedback } from "./types";

interface FeedackLLMProps {
  actions?: ChatActions;
  message: ChatMessageTyped;
}

export function FeedbackLLM({ actions, message }: FeedackLLMProps) {
  if (actions == null) return null;
  const account_id = redux.getStore("account").get_account_id();

  //const date = message.get("date")?.getTime() ?? 0;
  const val = message.getIn(["feedback", account_id]);

  function feedback(what: Feedback) {
    return `Give a ${what} feedback about this answer written by the language model.`;
  }

  const isNegative = val === "negative";
  const isPositive = val === "positive";

  return (
    <Space.Compact>
      <Button
        bsSize="xsmall"
        bsStyle="ghost"
        active={isPositive}
        onClick={() =>
          actions?.feedback(message, isPositive ? null : "positive")
        }
        title={feedback("positive")}
      >
        👍
      </Button>
      <Button
        bsSize="xsmall"
        bsStyle="ghost"
        active={isNegative}
        onClick={() =>
          actions?.feedback(message, isNegative ? null : "negative")
        }
        title={feedback("negative")}
      >
        👎
      </Button>
    </Space.Compact>
  );
}
