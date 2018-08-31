/*
Manage codemirror gutters that provide messages and other info from the backend LEAN.
*/

import { Rendered } from "smc-webapp/app-framework";

import { List } from "immutable";

import * as React from "react";

const { Icon, Tip } = require("smc-webapp/r_misc");

import { RenderedMessage, message_color, message_icon } from "./lean-info";

import { Message, Task } from "./types";

import { Editor } from "codemirror";

export function update_gutters(opts: {
  cm: Editor;
  synced: boolean;
  set_gutter: Function;
  messages: List<any>;
  tasks: List<any>;
}): void {
  for (let message of opts.messages.toJS()) {
    opts.set_gutter(
      message.pos_line - 1,
      message_component(
        message,
        opts.synced,
        opts.cm.getDoc().getLine(message.pos_line - 1)
      )
    );
  }
  if (opts.tasks.size > 0) {
    let task: Task;
    for (task of opts.tasks.toJS()) {
      for (let line = task.pos_line; line < task.end_pos_line; line++) {
        opts.set_gutter(line - 1, task_component(opts.synced));
      }
    }
  }
}

function task_component(synced: boolean): Rendered {
  let color;
  if (synced) {
    color = "#5cb85c";
  } else {
    color = "#888";
  }
  return <Icon name={"square"} style={{ color }} />;
}

function message_component(
  message: Message,
  synced: boolean,
  context: string
): Rendered {
  const icon = message_icon(message.severity);
  const color = message_color(message.severity, synced);
  const content = <RenderedMessage message={message} synced={synced} />;
  return (
    <Tip
      title={<pre>{context}</pre>}
      tip={content}
      placement={"right"}
      stable={true}
      popover_style={{
        marginLeft: "10px",
        border: `2px solid ${color}`,
        width: "700px",
        maxWidth: "80%"
      }}
      delayShow={0}
      allow_touch={true}
    >
      <Icon name={icon} style={{ color, cursor: "pointer" }} />
    </Tip>
  );
}
