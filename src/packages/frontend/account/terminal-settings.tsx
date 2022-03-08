/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useTypedRedux } from "../app-framework";
import { set_account_table } from "./util";
import { Icon, LabeledRow, SelectorInput, Loading } from "../components";
import { Panel } from "../antd-bootstrap";
import { theme_desc } from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";

declare global {
  interface Window {
    Terminal: any;
  }
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
          options={theme_desc}
          on_change={(color_scheme) =>
            set_account_table({ terminal: { color_scheme } })
          }
        />
      </LabeledRow>
    </Panel>
  );
};
