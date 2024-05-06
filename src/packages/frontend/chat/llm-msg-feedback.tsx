/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Space, Tooltip } from "antd";
import { List } from "immutable";

import { redux } from "@cocalc/frontend/app-framework";
import { ChatActions } from "./actions";
import { ChatMessageTyped } from "./types";

interface FeedackLLMProps {
  actions?: ChatActions;
  message: ChatMessageTyped;
}

export function FeedbackLLM({ actions, message }: FeedackLLMProps) {
  if (actions == null) return null;
  const account_id = redux.getStore("account").get_account_id();

  //const date = message.get("date")?.getTime() ?? 0;
  const sentiment = (message.get("sentiments") ?? List([]))
    .filter((key) => key.startsWith(account_id))
    .first();

  function feedback(what: "positive" | "negative") {
    return `Give a ${what} feedback about this answer written by the language model.`;
  }

  function onNegative() {
    actions?.feedback(message, "negative");
  }

  return (
    <Space.Compact>
      <code>S: {sentiment}</code>
      <Tooltip title={feedback("positive")}>
        <Button
          size="small"
          type="text"
          onClick={() => actions?.feedback(message, "positive")}
        >
          👍
        </Button>
      </Tooltip>
      <Tooltip title={feedback("negative")}>
        <Button size="small" type="text" onClick={onNegative}>
          👎
        </Button>
      </Tooltip>
    </Space.Compact>
  );
}
