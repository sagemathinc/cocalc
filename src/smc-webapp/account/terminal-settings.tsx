/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux } from "../app-framework";
import { set_account_table } from "./util";
import { Icon, LabeledRow, SelectorInput, Loading } from "../r_misc";
import { Panel } from "../antd-bootstrap";

declare global {
  interface Window {
    Terminal: any;
  }
}

const TERMINAL_COLOR_SCHEMES: { [name: string]: string } = {};

// This global Terminal object is from old xterm.js, and the color_schemes
// stuff is defined in webapp-lib/term/color_themes.js
// Of course we should do this in a better way!
for (const theme in window.Terminal.color_schemes) {
  const val = window.Terminal.color_schemes[theme];
  TERMINAL_COLOR_SCHEMES[theme] = val.comment;
}

export const TerminalSettings: React.FC = () => {
  const terminal = useTypedRedux("account", "terminal");

  if (terminal == null) {
    return <Loading />;
  }

  return (
    <Panel
      header={
        <>
          {" "}
          <Icon name="terminal" /> Terminal
        </>
      }
    >
      <LabeledRow label="Terminal color scheme">
        <SelectorInput
          selected={terminal?.get("color_scheme")}
          options={TERMINAL_COLOR_SCHEMES}
          on_change={(color_scheme) =>
            set_account_table({ terminal: { color_scheme } })
          }
        />
      </LabeledRow>
    </Panel>
  );
};
