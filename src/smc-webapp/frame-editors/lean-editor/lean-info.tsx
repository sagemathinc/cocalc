import { Map } from "immutable";

import { is_different } from "../generic/misc";

const { Markdown } = require("smc-webapp/r_misc");

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
  info: Map<string, any>; // keys are: doc, source, state, tactic_params, text, type
  sync: Map<any, number>;
  syncstring_hash: number;
}

function render_text(text: string, zoom: number = 100): Rendered {
  return (
    <div
      style={{
        display: "block",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        marginTop: "1ex",
        fontSize: `${zoom}%`
      }}
    >
      {text}
    </div>
  );
}

class LeanInfo extends Component<Props, {}> {
  static displayName = "LeanInfo";

  shouldComponentUpdate(next_props): boolean {
    return is_different(this.props, next_props, [
      "font_size",
      "info",
      "sync",
      "syncstring_hash"
    ]);
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        info: rtypes.immutable.Map,
        sync: rtypes.immutable.Map,
        syncstring_hash: rtypes.number
      }
    };
  }

  render_heading(value: string): Rendered {
    return (
      <div>
        <u>
          <b>{value}</b>
        </u>
      </div>
    );
  }

  render_state(): Rendered {
    const state = this.props.info.get("state");
    if (!state) {
      return;
    }
    return (
      <div>
        {this.render_heading("Tactic State")}
        {render_text(state, 105)}
      </div>
    );
  }

  render_doc(): Rendered {
    const doc = this.props.info.get("doc");
    const params = this.props.info.get("tactic_params");
    if (!doc && !params) {
      return;
    }
    return (
      <div>
        {this.render_heading(params)}
        <Markdown value={doc} safeHTML={false} highlight_code={true} />
      </div>
    );
  }

  render_info(): Rendered {
    if (this.props.info == null) {
      return;
    }
    return (
      <div>
        {this.render_state()}
        <hr />
        {this.render_doc()}
      </div>
    );
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
        {this.render_info()}
      </div>
    );
  }
}

const LeanInfo0 = rclass(LeanInfo);
export { LeanInfo0 as LeanInfo };
