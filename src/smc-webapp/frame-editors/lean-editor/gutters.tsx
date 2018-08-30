/*
Manage codemirror gutters that provide messages and other info from the backend LEAN.
*/

import { List } from "immutable";

import * as React from "react";

const { Icon, Tip } = require("smc-webapp/r_misc");

import { RenderedMessage, message_color, message_icon } from "./lean-info";

export function update_gutters(opts: {
  set_gutter: Function;
  messages: List<any>;
  tasks: List<any>;
}): void {
  for (let message of opts.messages.toJS()) {
    opts.set_gutter(message.pos_line - 1, component(message));
  }
}

function component(message) {
  const icon = message_icon(message.severity);
  const color = message_color(message.severity);
  const content = <RenderedMessage message={message} />;
  return (
    <Tip
      title={"title"}
      tip={content}
      placement={"right"}
      icon={"file"}
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
