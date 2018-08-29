import { List } from "immutable";

const { Space } = require("smc-webapp/r_misc");

import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

interface Props {
  // reduxProps:
  messages: List<any>;
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
        messages: rtypes.immutable.List
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
      return <div>(nothing)</div>;
    }
    const v: Rendered[] = [];
    let i = 0;
    for (let x of this.props.messages.toJS()) {
      v.push(this.render_message(i, x));
      i += 1;
    }
    return v;
  }

  render(): Rendered {
    return (
      <div style={{ overflowY: "auto", margin: "0px 15px" }}>
        {this.render_messages()}
      </div>
    );
  }
}

const LeanInfo0 = rclass(LeanInfo);
export { LeanInfo0 as LeanInfo };
