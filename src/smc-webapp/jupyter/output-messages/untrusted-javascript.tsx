import { React, Component, Rendered } from "smc-webapp/app-framework";
import { List } from "immutable";

interface UntrustedJavascriptProps {
  // TODO: not used now; however, we may show the untrusted javascript at some point.
  value?: string | List<string>;
}

export class UntrustedJavascript extends Component<UntrustedJavascriptProps> {
  render(): Rendered {
    return (
      <span style={{ color: "#888" }}>(not running untrusted Javascript)</span>
    );
  }
}
