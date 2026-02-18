/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage, useIntl } from "react-intl";

import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  LabeledRow,
  Loading,
  Paragraph,
  SelectorInput,
} from "@cocalc/frontend/components";
import { KEYBOARD_ICON_NAME } from "./account-preferences-keyboard";
import { IS_MACOS } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import keyboardShortcuts from "./keyboard-shortcuts";
import { set_account_table } from "./util";

const KEYBOARD_SHORTCUTS = keyboardShortcuts(IS_MACOS);

const EVALUATE_KEYS = {
  "Shift-Enter": "shift+enter",
  Enter: "enter (shift+enter for newline)",
} as const;

const LABEL_COLS = 8;

export const KeyboardSettings: React.FC = () => {
  const intl = useIntl();
  const evaluate_key = useTypedRedux("account", "evaluate_key");

  function render_keyboard_shortcuts(): React.JSX.Element[] {
    const v: React.JSX.Element[] = [];
    for (const { command, shortcut } of KEYBOARD_SHORTCUTS) {
      const key = command.id;
      const label = intl.formatMessage(command);
      v.push(
        <LabeledRow key={key} label={label} label_cols={LABEL_COLS}>
          {shortcut}
        </LabeledRow>,
      );
    }
    return v;
  }

  function eval_change(value): void {
    set_account_table({ evaluate_key: value });
  }

  function render_eval_shortcut(): React.JSX.Element {
    if (evaluate_key == null) {
      return <Loading />;
    }
    const label = intl.formatMessage({
      id: "account.keyboard-settings.sagews-eval-key",
      defaultMessage: "Sage Worksheet evaluate key",
    });
    return (
      <LabeledRow label={label} label_cols={LABEL_COLS}>
        <SelectorInput
          options={EVALUATE_KEYS}
          selected={evaluate_key}
          on_change={eval_change}
        />
      </LabeledRow>
    );
  }

  function render_intro() {
    return (
      <Paragraph type="secondary">
        <FormattedMessage
          id="account.keyboard-settings.intro"
          defaultMessage={`These are mostly CoCalc-specific keyboard shortcuts for editing code.
            Many of these are not standard functions provided by editor keyboards.
            Unfortunately, keyboard shortcuts are not currently customizable.`}
        />
      </Paragraph>
    );
  }

  return (
    <Panel
      role="region"
      aria-label="Keyboard shortcuts"
      header={
        <>
          <Icon name={KEYBOARD_ICON_NAME} />{" "}
          {intl.formatMessage(labels.keyboard_shortcuts)}
        </>
      }
    >
      {render_intro()}
      {render_keyboard_shortcuts()}
      {render_eval_shortcut()}
    </Panel>
  );
};
