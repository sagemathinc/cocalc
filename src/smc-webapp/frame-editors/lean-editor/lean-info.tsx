import { List, Map } from "immutable";

const { Icon, Space, TimeAgo } = require("smc-webapp/r_misc");

import { server_time } from "../generic/client";

import { Message } from "./types";

import { capitalize, is_different } from "../generic/misc";

import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

interface Props {
  font_size: number;
  // reduxProps:
  messages: List<any>;
  tasks: List<any>;
  sync: Map<any, number>;
  syncstring_hash: number;
}

function render_pos(line: number, col: number): Rendered {
  return (
    <span>
      {line}:{col}
    </span>
  );
}

function render_severity(severity: string): Rendered {
  return <span>{severity}</span>;
}

function render_caption(caption: string): Rendered {
  return <span>{caption}</span>;
}

const COLORS = {
  information: "#5bc0de",
  error: "#d9534f",
  warning: "#f0ad4e"
};

export function message_color(severity: string, synced: boolean): string {
  if (!synced) {
    return "grey";
  }
  const color = COLORS[severity];
  return color ? color : "grey";
}

const ICONS = {
  information: "info-circle",
  error: "exclamation-triangle",
  warning: "exclamation-circle"
};

export function message_icon(severity: string): string {
  const icon = ICONS[severity];
  return icon ? icon : "question-circle";
}

function render_text(text: string): Rendered {
  return (
    <div
      style={{
        display: "block",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        marginTop: "1ex",
        fontSize: "110%"
      }}
    >
      {text}
    </div>
  );
}

// nothing extra yet.
interface MessageProps {
  message: Message;
  synced: boolean;
}

export class RenderedMessage extends Component<MessageProps, {}> {
  static displayName = "LeanInfoMessage";

  render(): Rendered {
    const message = this.props.message;
    const color = message_color(message.severity, this.props.synced);
    return (
      <div>
        <div
          style={{
            fontFamily: "sans-serif",
            fontWeight: "bold",
            color: color,
            borderBottom: `1px solid ${color}`
          }}
        >
          <Icon name={message_icon(message.severity)} />
          <Space />
          {message.pos_line !== undefined && message.pos_col !== undefined
            ? render_pos(message.pos_line, message.pos_col)
            : undefined}
          <Space />
          {message.severity !== undefined
            ? render_severity(message.severity)
            : undefined}
          <Space />
          {message.caption !== undefined
            ? render_caption(message.caption)
            : undefined}
        </div>
        {message.text !== undefined ? render_text(message.text) : undefined}
      </div>
    );
  }
}

class LeanInfo extends Component<Props, {}> {
  static displayName = "LeanInfo";

  shouldComponentUpdate(next_props): boolean {
    return is_different(this.props, next_props, [
      "font_size",
      "messages",
      "tasks",
      "sync",
      "syncstring_hash"
    ]);
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        messages: rtypes.immutable.List,
        tasks: rtypes.immutable.List,
        sync: rtypes.immutable.Map,
        syncstring_hash: rtypes.number
      }
    };
  }

  render_message(key, message): Rendered {
    return (
      <div key={key} style={{ paddingBottom: "1ex" }}>
        <RenderedMessage
          message={message}
          synced={this.props.sync.get("hash") === this.props.syncstring_hash}
        />
      </div>
    );
  }

  render_messages(): Rendered | Rendered[] {
    if (!this.props.messages) {
      return <div key="messages">(nothing)</div>;
    }
    const v: Rendered[] = [];
    const messages = this.props.messages.toJS();
    messages.sort(cmp_messages);
    let i = 0;
    for (let message of messages) {
      v.push(this.render_message(i, message));
      i += 1;
    }
    return v;
  }

  render_task(i, task): Rendered {
    return (
      <div
        key={i}
        style={{
          fontSize: "12pt",
          color: "#666",
          fontWeight: "bold",
          borderBottom: "1px solid black",
          minHeight: "30px",
          marginBottom: "15px"
        }}
      >
        <Icon name="cc-icon-cocalc-ring" spin />
        <Space />
        {capitalize(task.desc)}
        <Space /> (Processing lines {task.pos_line}-{task.end_pos_line})
      </div>
    );
  }

  render_done(): Rendered {
    return (
      <div
        key={0}
        style={{
          fontSize: "12pt",
          color: "#666",
          fontWeight: "bold",
          borderBottom: "1px solid black",
          minHeight: "30px"
        }}
      >
        <Icon name="check-circle" />
      </div>
    );
  }

  render_tasks(): Rendered | Rendered[] {
    if (!this.props.tasks || this.props.tasks.size === 0) {
      return this.render_done();
    }
    const v: Rendered[] = [];
    let i = 0;
    for (let task of this.props.tasks.toJS()) {
      v.push(this.render_task(i, task));
      i += 1;
    }
    return v;
  }

  render_last_run_time(): Rendered {
    const time = this.props.sync.get("time");
    if (!time) {
      return;
    }
    const t =
      new Date().valueOf() - Math.max(0, server_time().valueOf() - time);
    return <TimeAgo date={t} />;
  }

  render_sync(): Rendered {
    if (this.props.sync.get("hash") === this.props.syncstring_hash) {
      return (
        <div style={{ marginTop: "5px" }}>
          Synced ({this.render_last_run_time()})
        </div>
      );
    } else {
      return <div style={{ marginTop: "5px" }}>Syncing...</div>;
    }
  }

  render(): Rendered {
    return (
      <div
        style={{
          overflowY: "auto",
          margin: "0px 15px",
          fontSize: this.props.font_size
        }}
      >
        {this.render_sync()}
        {this.render_tasks()}
        {this.render_messages()}
      </div>
    );
  }
}

const LeanInfo0 = rclass(LeanInfo);
export { LeanInfo0 as LeanInfo };

function cmp_messages(m0: Message, m1: Message): number {
  if (
    m0.pos_line < m1.pos_line ||
    (m0.pos_line === m1.pos_line && m0.pos_col < m1.pos_col)
  ) {
    return -1;
  } else if (m0.pos_line === m1.pos_line && m0.pos_col === m1.pos_col) {
    return 0;
  } else {
    return 1;
  }
}
