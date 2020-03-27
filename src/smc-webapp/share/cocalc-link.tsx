import { React, Component, Rendered } from "../app-framework";

interface Props {
  base_url: string;
  viewer?: string;
}

export class CoCalcLink extends Component<Props> {
  private target(): string {
    return "https://cocalc.com" + this.props.base_url;
  }

  private link(text: string): Rendered {
    return (
      <a href={this.target()} target={"_blank"} rel={"noopener"}>
        {text}
      </a>
    );
  }

  public render(): Rendered {
    if (this.props.viewer === "embed") {
      return (
        <div
          style={{
            right: "5px",
            top: "5px",
            position: "absolute",
            fontSize: "8pt",
            border: "1px solid #aaa",
            padding: "2px",
            zIndex: 1000,
          }}
        >
          {this.link("Powered by CoCalc")}
        </div>
      );
    } else {
      return (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translate(-50%)",
            fontSize: "12pt",
          }}
        >
          {this.link("CoCalc")}
        </div>
      );
    }
  }
}
