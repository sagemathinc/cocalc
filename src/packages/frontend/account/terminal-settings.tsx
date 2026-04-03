/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
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
  getThemeName,
  theme_desc,
} from "@cocalc/frontend/frame-editors/terminal-editor/theme-data";
import { useColorTheme } from "../app/theme-context";
import { labels } from "@cocalc/frontend/i18n";
import { DEFAULT_TERMINAL_COLOR_SCHEME } from "@cocalc/util/db-schema/accounts";
import { set_account_table } from "./util";

declare global {
  interface Window {
    Terminal: any;
  }
}

export function TerminalSettings() {
  const intl = useIntl();
  const theme = useColorTheme();

  const terminal = useTypedRedux("account", "terminal");
  const raw_scheme = terminal?.get("color_scheme") ?? DEFAULT_TERMINAL_COLOR_SCHEME;
  // Keep "cocalc" (auto light/dark) as-is for the selector; only resolve unknown values
  const color_scheme = raw_scheme in theme_desc ? raw_scheme : getThemeName(raw_scheme);

  if (terminal == null) {
    return <Loading />;
  }

  function setTerminalColorScheme(color_scheme: string): void {
    set_account_table({ terminal: { color_scheme } });
  }

  const label = intl.formatMessage({
    id: "account.terminal-settings.label-row.label",
    defaultMessage: "Terminal color scheme",
  });

  return (
    <Panel
      size="small"
      header={
        <>
          <Icon name="terminal" /> Terminal Settings
        </>
      }
    >
      <div
        style={{
          fontSize: 12,
          color: "var(--cocalc-text-tertiary, #888)",
          marginBottom: 8,
        }}
      >
        {intl.formatMessage({
          id: "account.terminal-settings.explanation",
          defaultMessage:
            "The 'CoCalc (auto light/dark)' option automatically switches between CoCalc Light and CoCalc Dark to match your color theme and dark mode setting.",
        })}
      </div>
      <LabeledRow label={label}>
        <Button
          disabled={color_scheme === DEFAULT_TERMINAL_COLOR_SCHEME}
          style={{ float: "right" }}
          onClick={() => setTerminalColorScheme(DEFAULT_TERMINAL_COLOR_SCHEME)}
        >
          {intl.formatMessage(labels.reset)}
        </Button>
        <SelectorInput
          style={{ width: "250px" }}
          selected={color_scheme}
          options={theme_desc}
          on_change={setTerminalColorScheme}
          showSearch={true}
        />
      </LabeledRow>
      <TerminalPreview color_scheme={color_scheme} isDark={!!theme.isDark} />
    </Panel>
  );
}

function TerminalPreview({
  color_scheme,
  isDark,
}: {
  color_scheme: string;
  isDark: boolean;
}) {
  const html = example(color_scheme || "default", isDark);
  return (
    <div
      style={{
        marginTop: "10px",
        border: "1px solid var(--cocalc-border, #ccc)",
        borderRadius: "4px",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
