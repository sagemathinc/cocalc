import { Map } from "immutable";
import { is_different /* , capitalize, path_split*/ } from "../generic/misc";
import {
  Component,
  React,
  rclass,
  rtypes
  //,  Rendered
} from "../../app-framework";
//import { TypedMap } from "../../app-framework/TypedMap";
// const { Icon, Loading } = require("smc-webapp/r_misc");

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

  render(): React.ReactElement<any> {
    return (
      <div
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
