import { List } from "immutable";

const { Icon, Space } = require("smc-webapp/r_misc");

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
  sync: number;
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
  information: "green",
  error: "red",
  warning: "orange"
};

function message_color(severity: string): string {
  const color = COLORS[severity];
  return color ? color : "grey";
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

class LeanInfo extends Component<Props, {}> {
  static displayName = "LeanInfo";

  static reduxProps({ name }) {
    return {
      [name]: {
        messages: rtypes.immutable.List,
        tasks: rtypes.immutable.List,
        sync: rtypes.number,
        syncstring_hash: rtypes.number
      }
    };
  }

  render_message(key, x): Rendered {
    const color = message_color(x.severity);
    return (
      <div key={key} style={{ paddingBottom: "1ex" }}>
        <div
          style={{
            fontFamily: "sans-serif",
            fontWeight: "bold",
            color: color,
            borderBottom: `1px solid ${color}`
          }}
        >
          {x.pos_line !== undefined && x.pos_col !== undefined
            ? render_pos(x.pos_line, x.pos_col)
            : undefined}
          <Space />
          {x.severity !== undefined ? render_severity(x.severity) : undefined}
          <Space />
          {x.caption !== undefined ? render_caption(x.caption) : undefined}
        </div>
        {x.text !== undefined ? render_text(x.text) : undefined}
      </div>
    );
  }

  render_messages(): Rendered | Rendered[] {
    if (!this.props.messages) {
      return <div key="messages">(nothing)</div>;
    }
    const v: Rendered[] = [];
    let i = 0;
    for (let message of this.props.messages.toJS()) {
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
          minHeight: "30px"
        }}
      >
        <Icon name="cc-icon-cocalc-ring" spin />
        <Space />
        {task.desc}
        <Space /> (processing {task.pos_line}:{task.pos_col} -{" "}
        {task.end_pos_line}:{task.end_pos_col})
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

  render_sync(): Rendered {
    if (this.props.sync === this.props.syncstring_hash) {
      return <div style={{float:'right', marginTop:'5px'}}>Synchronized</div>;
    } else {
      return <div style={{float:'right', marginTop:'5px'}}>Syncing...</div>;
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
