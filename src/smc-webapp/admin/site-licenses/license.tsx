import { React, Rendered, Component, TypedMap } from "../../app-framework";
import { SiteLicense } from "./types";

interface Props {
  editing?: boolean;
  license: TypedMap<SiteLicense>;
}

export class License extends Component<Props> {
  public render(): Rendered {
    const id = this.props.license.get("id");
    let style: React.CSSProperties | undefined = undefined;
    if (this.props.editing) {
      style = { border: "1px solid blue" };
    }
    return (
      <pre key={id} style={style}>
        {" "}
        {JSON.stringify(this.props.license.toJS(), undefined, 2)}
      </pre>
    );
  }
}
