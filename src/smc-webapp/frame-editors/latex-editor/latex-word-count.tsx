import { Map } from "immutable";
import { is_different } from "smc-util/misc2";
import { Component, React, rclass, rtypes } from "../../app-framework";

interface ILatexWordCount {
  id: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;

  // reduxProps:
  word_count: string;
}

class LatexWordCount extends Component<ILatexWordCount, {}> {
  static defaultProps = { word_count: "" };

  static reduxProps({ name }) {
    return {
      [name]: {
        word_count: rtypes.string
      }
    };
  }

  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["word_count"]);
  }

  componentDidMount(): void {
    this.props.actions.word_count(0, false);
  }

  render(): React.ReactElement<any> {
    return (
      <div
        cocalc-test={"word-count-output"}
        className={"smc-vfill"}
        style={{
          overflowY: "scroll",
          padding: "5px 15px",
          fontSize: "10pt",
          whiteSpace: "pre-wrap",
          fontFamily: "monospace"
        }}
      >
        {this.props.word_count}
      </div>
    );
  }
}

const tmp = rclass(LatexWordCount);
export { tmp as LatexWordCount };
