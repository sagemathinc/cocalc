/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useIntl } from "react-intl";

import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  LabeledRow,
  Loading,
  SelectorInput,
} from "@cocalc/frontend/components";
import {
  example,
  theme_desc,
} from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";
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
  const color_scheme = terminal?.get("color_scheme") || "default";

  if (terminal == null) {
    return <Loading />;
  }

  const label = intl.formatMessage({
    id: "account.terminal-settings.label-row.label",
    defaultMessage: "Terminal color scheme",
  });

  return (
    <Panel
      size="small"
      role="region"
      aria-label="Terminal settings"
      header={
        <>
          <Icon name="terminal" /> Terminal Settings
        </>
      }
    >
      <LabeledRow label={label}>
        <Button
          disabled={color_scheme === "default"}
          style={{ float: "right" }}
          onClick={() => {
            set_account_table({ terminal: { color_scheme: "default" } });
          }}
        >
          {intl.formatMessage(labels.reset)}
        </Button>
        <SelectorInput
          style={{ width: "250px" }}
          selected={color_scheme}
          options={theme_desc}
          on_change={(color_scheme) =>
            set_account_table({ terminal: { color_scheme } })
          }
          showSearch={true}
        />
      </LabeledRow>
      <TerminalPreview color_scheme={color_scheme} />
    </Panel>
  );
}

function TerminalPreview({ color_scheme }: { color_scheme: string }) {
  const html = example(color_scheme || "default");
  return (
    <div
      style={{
        marginTop: "10px",
        border: "1px solid #ccc",
        borderRadius: "4px",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
