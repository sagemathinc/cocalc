import { Map } from "immutable";

import { is_different } from "smc-util/misc2";

import { Markdown } from "smc-webapp/r_misc";

import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes,
} from "../../app-framework";

interface Props {
  font_size: number;
  // reduxProps:
  info: Map<string, any>; // keys are: doc, source, state, tactic_params, text, type
  sync: Map<any, number>;
  syncstring_hash: number;
}

class LeanHelp extends Component<Props, {}> {
  static displayName = "LeanHelp";

  shouldComponentUpdate(next_props): boolean {
    return is_different(this.props, next_props, [
      "font_size",
      "info",
      "sync",
      "syncstring_hash",
    ]);
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        info: rtypes.immutable.Map,
        sync: rtypes.immutable.Map,
        syncstring_hash: rtypes.number,
      },
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

  render(): Rendered {
    if (this.props.info == null) {
      return <span />;
    }
    return (
      <div
        style={{
          overflowY: "auto",
          margin: "0px 15px",
          fontSize: this.props.font_size,
        }}
      >
        {this.render_doc()}
      </div>
    );
  }
}

const LeanHelp0 = rclass(LeanHelp);
export { LeanHelp0 as LeanHelp };
