/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  LabeledRow,
  Loading,
  SelectorInput,
} from "@cocalc/frontend/components";
import { theme_desc } from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";
import { labels } from "@cocalc/frontend/i18n";
import { set_account_table } from "./util";

declare global {
  interface Window {
    Terminal: any;
  }
}

export function TerminalSettings() {
  const intl = useIntl();

  const terminal = useTypedRedux("account", "terminal");

  if (terminal == null) {
    return <Loading />;
  }

  const label = intl.formatMessage({
    id: "account.terminal-settings.label-row.label",
    defaultMessage: "Terminal color scheme",
  });

  return (
    <Panel
      header={
        <>
          <Icon name="terminal" /> {intl.formatMessage(labels.terminal)}
        </>
      }
    >
      <LabeledRow label={label}>
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
}
