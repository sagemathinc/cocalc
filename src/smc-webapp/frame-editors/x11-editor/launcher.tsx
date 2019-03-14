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
import { List } from "immutable";
const { Button } = require("react-bootstrap");
const { Icon } = require("r_misc");
import { APPS } from "./apps";
import { is_different } from "smc-util/misc2";
import { Actions } from "./actions";

function sort_apps(k): string {
  const label = APPS[k].label;
  const name = label ? label : k;
  return name.toLowerCase();
}

const APP_KEYS: string[] = sortBy(keys(APPS), sort_apps);

interface Props {
  actions: Actions;
  hide_apps?: List<string>;
}

export class LauncherComponent extends Component<Props, {}> {
  static displayName = "X11 Launcher";

  constructor(props) {
    super(props);
    this.launch = debounce(this.launch.bind(this), 500, true);
  }

  static reduxProps({ name }) {
    return {
      [name]: {
        hide_apps: rtypes.array
      }
    };
  }

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, ["hide_apps"]);
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
    const v: Rendered[] = [];
    for (let app of APP_KEYS) {
      if (this.props.hide_apps != null) {
        if (this.props.hide_apps.includes(app)) continue;
      }
      v.push(this.render_launcher(app));
    }
    return v;
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
