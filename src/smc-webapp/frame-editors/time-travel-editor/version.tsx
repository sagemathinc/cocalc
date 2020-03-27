/* Show a revision version, both with a number and the time. */

import { Rendered, Component, React } from "../../app-framework";
import { TimeAgo } from "../../r_misc";

interface Props {
  date: Date;
  number: number;
  max: number;
}

export class Version extends Component<Props> {
  private render_time(): Rendered {
    return (
      <span
        style={{
          fontWeight: "bold",
          fontSize: "12pt",
          color: "#666",
          whiteSpace: "nowrap",
        }}
      >
        <TimeAgo date={this.props.date} />
      </span>
    );
  }
  private render_number(): Rendered {
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        revision {this.props.number} (of {this.props.max})
      </span>
    );
  }

  public render(): Rendered {
    if (this.props.max == 0) return <span />;
    return (
      <span>
        {this.render_time()}, {this.render_number()}
      </span>
    );
  }
}

interface RangeProps {
  version0: number;
  version1: number;
  max: number;
}

export class VersionRange extends Component<RangeProps> {
  public render(): Rendered {
    if (this.props.max == 0) return <span />;
    return (
      <span style={{ whiteSpace: "nowrap" }}>
        Versions {this.props.version0 + 1} to {this.props.version1 + 1} (of{" "}
        {this.props.max})
      </span>
    );
  }
}
