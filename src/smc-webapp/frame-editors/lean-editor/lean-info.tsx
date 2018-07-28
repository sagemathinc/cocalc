const { Icon } = require("../../r_misc");
import { List } from "immutable";

import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

interface Props {
  // reduxProps:
  server: List<any>;
}

class LeanInfo extends Component<Props, {}> {
  static displayName = "LeanInfo";

  static reduxProps({ name }) {
    return {
      [name]: {
        server: rtypes.immutable.List
      }
    };
  }

  render_message(x): Rendered {
    return (
      <div key={x.n} style={{ borderTop: "1px solid grey" }}>
        {JSON.stringify(x)}
        <br />
      </div>
    );
  }

  render_messages(): Rendered | Rendered[] {
    if (!this.props.server) {
      return <div>(nothing)</div>;
    }
    const v: Rendered[] = [];
    for (let x of this.props.server.toJS()) {
      if (x.type == "mesg") {
        v.push(this.render_message(x));
      }
    }
    return v;
  }

  render(): Rendered {
    return (
      <div>
        Messages
        <br />
        {this.render_messages()}
      </div>
    );
  }
}

const LeanInfo0 = rclass(LeanInfo);
export { LeanInfo0 as LeanInfo };
