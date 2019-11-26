/*
X11 Window frame.
*/

import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";
import { debounce, keys, sortBy } from "underscore";
const { Button } = require("react-bootstrap");
import { Icon } from "../../r_misc";
import { APPS } from "./apps";
import { is_different } from "smc-util/misc2";
import { Actions } from "./actions";
import { Capabilities } from "../../project_configuration";

function sort_apps(k): string {
  const label = APPS[k].label;
  const name = label ? label : k;
  return name.toLowerCase();
}

const APP_KEYS: ReadonlyArray<string> = Object.freeze(
  sortBy(keys(APPS), sort_apps)
);

interface Props {
  actions: Actions;
  x11_apps?: Readonly<Capabilities>;
}

export class LauncherComponent extends Component<Props, {}> {
  static displayName = "X11 Launcher";

  constructor(props) {
    super(props);
    this.launch = debounce(this.launch.bind(this), 500, true);
    this.render_launcher = this.render_launcher.bind(this);
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        x11_apps: rtypes.object
      }
    };
  }

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, ["x11_apps"]);
  }

  launch(app: string): void {
    const desc = APPS[app];
    if (desc == null) {
      return;
    }
    this.props.actions.launch(desc.command ? desc.command : app, desc.args);
  }

  render_launcher(app: string): Rendered {
    const desc = APPS[app];
    if (desc == null) return;

    let icon: Rendered = undefined;
    if (desc.icon != null) {
      icon = <Icon name={desc.icon} style={{ marginRight: "5px" }} />;
    }

    return (
      <Button
        key={app}
        onClick={() => this.launch(app)}
        title={desc.desc}
        style={{ margin: "5px" }}
      >
        {icon}
        {desc.label ? desc.label : app}
      </Button>
    );
  }

  render_launchers(): Rendered[] {
    // i.e. wait until we know which apps exist …
    const available = this.props.x11_apps;
    if (available == null) return [];
    // hide those apps, where certainly know they're not available
    return APP_KEYS.filter(app => {
      const avail = available[app];
      return avail !== false;
    }).map(this.render_launcher);
  }

  render(): Rendered {
    return (
      <div style={{ overflowY: "auto", padding: "5px" }}>
        {this.render_launchers()}
      </div>
    );
  }
}

export const Launcher = rclass(LauncherComponent);
