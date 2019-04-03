import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { endswith } from "smc-util/misc2";
import { Ansi } from "./ansi";
import { TRACEBACK_STYLE } from "./style";

interface TracebackProps {
  message: Map<string, any>;
}

export class Traceback extends Component<TracebackProps> {
  shouldComponentUpdate(nextProps: TracebackProps): boolean {
    return !this.props.message.equals(nextProps.message);
  }

  render(): Rendered {
    const v: Rendered[] = [];
    let n: number = 0;

    this.props.message.get("traceback").forEach(function(x) {
      if (!endswith(x, "\n")) {
        x += "\n";
      }
      v.push(<Ansi key={n}>{x}</Ansi>);
      n += 1;
    });

    return <div style={TRACEBACK_STYLE}>{v}</div>;
  }
}
