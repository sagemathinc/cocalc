/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// 3rd Party Libraries
import { Button, Input, Space } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

// Internal Libraries
import {
  React,
  redux,
  useEffect,
  useRedux,
  useState,
} from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { Tip } from "@cocalc/frontend/components/tip";
import { labels } from "@cocalc/frontend/i18n";

// Sibling Libraries
import { COLORS } from "@cocalc/util/theme";
import { markdown_to_html } from "../index";
import { MarkdownWidgetActions } from "./actions";
import * as info from "./info";
import { MarkdownWidgetStore, MarkdownWidgetStoreState } from "./store";

export function init(): void {
  if (redux.hasActions(info.REDUX_NAME)) {
    return;
  }
  redux.createStore<MarkdownWidgetStoreState, MarkdownWidgetStore>(
    info.REDUX_NAME,
    MarkdownWidgetStore,
  );
  redux.createActions<MarkdownWidgetStoreState, MarkdownWidgetActions>(
    info.REDUX_NAME,
    MarkdownWidgetActions,
  );
}

interface MarkdownInputProps {
  autoFocus?: boolean;
  persist_id?: string; // A unique id to identify the input. Required if you want automatic persistence
  attach_to?: string; // Removes record when given store name is destroyed. Only use with persist_id
  default_value?: string;
  editing?: boolean; // Used to control the edit/display state. CANNOT be used with persist_id
  save_disabled?: boolean; // Used to control the save button
  on_change?: (value: string) => any; // called with the new value when the value while editing changes
  on_save?: (value: string) => any; // called when saving from editing and switching back
  on_edit?: (value: string) => any; // called when editing starts
  on_cancel?: (value: string) => any; // called when cancel button clicked
  rows?: number;
  placeholder?: string;
  rendered_style?: React.CSSProperties;
  hide_edit_button?: boolean;
}

interface MarkdownInput {
  open_inputs: Map<any, any>;
}

export function MarkdownInput({
  autoFocus,
  persist_id,
  attach_to,
  default_value = "",
  editing: initEditing = false,
  save_disabled,
  on_change,
  on_save,
  on_edit,
  on_cancel,
  rows,
  placeholder,
  rendered_style,
  hide_edit_button,
}: MarkdownInputProps) {
  const intl = useIntl();

  const open_inputs = useRedux([info.REDUX_NAME, "open_inputs"]);

  const actions = redux.getActions<
    MarkdownWidgetStoreState,
    MarkdownWidgetActions
  >(info.REDUX_NAME);

  const [value, setValue] = useState<string>("");
  const [editing, setEditing] = useState<boolean>(initEditing);

  useEffect(() => {
    if (persist_id && open_inputs.has(persist_id)) {
      setValue(open_inputs.get(persist_id));
      setEditing(true);
    }

    if (attach_to && !open_inputs.has(persist_id)) {
      redux.getStore(attach_to).on("destroy", clear_persist);
    }
  }, []);

  function persist_value(next) {
    if (persist_id != null) {
      actions.set_value(persist_id, next ?? value);
    }
  }

  function clear_persist() {
    if (persist_id != null) {
      actions.clear(persist_id);
    }
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    if (typeof on_change === "function") {
      on_change(next);
    }
    persist_value(next);
    setValue(next);
  }

  function edit() {
    if (typeof on_edit === "function") {
      on_edit(value);
    }
    if (!editing) {
      setEditing(true);
    }
    setValue(default_value ?? "");
  }

  function cancel() {
    if (typeof on_cancel === "function") {
      on_cancel(value);
    }
    clear_persist();
    if (editing) {
      setEditing(false);
    }
  }

  function save() {
    if (typeof on_save === "function") {
      on_save(value);
    }
    clear_persist();
    if (editing) {
      setEditing(false);
    }
  }

  function keydown(e) {
    if (e.keyCode === 27) {
      cancel();
    } else if (e.keyCode === 13) {
      if (rows == 1 || e.shiftKey) {
        save();
      }
    }
  }

  function to_html() {
    if (default_value) {
      const html = markdown_to_html(default_value);
      return { __html: html };
    } else {
      return { __html: "" };
    }
  }

  function renderTip() {
    const tip = intl.formatMessage({
      id: "markdown-input.tooltip.tip",
      defaultMessage: `\
      You may enter (Github flavored) markdown here. In particular, use #
      for headings, > for block quotes, *'s for italic text, **'s for bold
      text, - at the beginning of a line for lists, back ticks \` for code,
      and URL's will automatically become links.`,
    });
    return (
      <Tip title="Use Markdown" tip={tip}>
        <FormattedMessage
          id="markdown-input.tooltip.info"
          defaultMessage={`Format using {A}`}
          values={{ A: <A href={info.guide_link}>Markdown</A> }}
        />
      </Tip>
    );
  }

  if (editing) {
    return (
      <div>
        <Input.TextArea
          autoFocus={autoFocus ?? true}
          rows={rows ?? 4}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={keydown}
        />
        <div style={{ paddingTop: "8px", color: COLORS.GRAY_M }}>
          {renderTip()}
        </div>
        <Space style={{ paddingBottom: "5px" }}>
          <Button key="cancel" onClick={cancel}>
            {intl.formatMessage(labels.cancel)}
          </Button>
          <Button
            key="save"
            type="primary"
            onClick={save}
            disabled={save_disabled ?? value === default_value}
          >
            <Icon name="save" /> {intl.formatMessage(labels.save)}
          </Button>
        </Space>
      </div>
    );
  } else {
    const html = to_html();
    const style = html?.__html ? rendered_style : undefined;
    return (
      <div>
        <div dangerouslySetInnerHTML={html} style={style} />
        {!hide_edit_button ? (
          <Button onClick={edit}>
            <Icon name="edit" /> {intl.formatMessage(labels.edit)}
          </Button>
        ) : undefined}
      </div>
    );
  }
}
