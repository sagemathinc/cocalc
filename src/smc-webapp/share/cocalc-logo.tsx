import { React, Component, Rendered } from "../app-framework";

export class CoCalcLogo extends Component<{ base_url: string }> {
  public render(): Rendered {
    return (
      <img
        style={{ height: "21px", width: "21px" }}
        src={`${this.props.base_url}/share/cocalc-icon.svg`}
      />
    );
  }
}
