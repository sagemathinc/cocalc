import { List } from "immutable";
import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

interface Props {
  // reduxProps
  versions: List<Date>;
}

class TimeTravel extends Component<Props> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        versions: rtypes.immutable.List
      }
    };
  }

  public render(): Rendered {
    return <div>TimeTravel {JSON.stringify(this.props.versions.toJS())} </div>;
  }
}

const tmp = rclass(TimeTravel);
export { tmp as TimeTravel };
