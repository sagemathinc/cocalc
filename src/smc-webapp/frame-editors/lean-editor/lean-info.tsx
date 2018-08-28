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
  messages: List<any>;
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
    return (
      <div key={key} style={{ borderTop: "1px solid grey" }}>
        {JSON.stringify(x)}
        <br />
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
