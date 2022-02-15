/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
X11 Window frame.
*/

import { React, Rendered, TypedMap, useRedux } from "../../app-framework";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Icon } from "../../components";
import { APPS } from "./apps";
import { is_different } from "@cocalc/util/misc";
import { Actions } from "./actions";
import { Capabilities } from "../../project_configuration";
import { debounce, keys, sortBy } from "lodash";

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
  name: string;
}

function isSame(prev, next) {
  return !is_different(prev, next, ["x11_apps"]);
}

export const Launcher: React.FC<Props> = React.memo((props: Props) => {
  const { actions, name } = props;

  const x11_apps: TypedMap<Capabilities> | undefined = useRedux(
    name,
    "x11_apps"
  );

  const launch = debounce(_launch, 500, { leading: true, trailing: false });

  function _launch(app: string): void {
    const desc = APPS[app];
    if (desc == null) {
      return;
    }
    actions.launch(desc.command ? desc.command : app, desc.args);
  }

  function render_launcher(app: string): Rendered {
    const desc = APPS[app];
    if (desc == null) return;

    let icon: Rendered = undefined;
    if (desc.icon != null) {
      icon = <Icon name={desc.icon} style={{ marginRight: "5px" }} />;
    }

    return (
      <Button
        key={app}
        onClick={() => launch(app)}
        title={desc.desc}
        style={{ margin: "5px" }}
      >
        {icon}
        {desc.label ? desc.label : app}
      </Button>
    );
  }

  function render_launchers(): Rendered[] {
    // i.e. wait until we know which apps exist …
    const available = x11_apps;
    if (available == null) return [];
    // hide those apps, where certainly know they're not available
    return APP_KEYS.filter((app) => {
      const avail = available.get(app);
      return avail !== false;
    }).map(render_launcher);
  }

  return (
    <div style={{ overflowY: "auto", padding: "5px" }}>
      {render_launchers()}
    </div>
  );
}, isSame);
