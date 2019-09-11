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
      <span style={{ fontWeight: "bold", fontSize: "12pt", color:'#666'}}>
        <TimeAgo date={this.props.date} />
      </span>
    );
  }
  private render_number(): Rendered {
    return (
      <span>
        revision {this.props.number} (of {this.props.max})
      </span>
    );
  }

  public render(): Rendered {
    return (
      <span>
        {this.render_time()}, {this.render_number()}
      </span>
    );
  }
}
