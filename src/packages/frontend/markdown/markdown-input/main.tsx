/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// 3rd Party Libraries
import { markdown_to_html } from "../index";
import { Tip } from "@cocalc/frontend/components/tip";
import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Input, Space } from "antd";
// Internal Libraries
import {
  Component,
  React,
  rclass,
  redux,
  rtypes,
} from "@cocalc/frontend/app-framework";

// Sibling Libraries
import * as info from "./info";
import { MarkdownWidgetActions } from "./actions";
import { MarkdownWidgetStore, MarkdownWidgetStoreState } from "./store";

export function init(): void {
  if (redux.hasActions(info.name)) {
    return;
  }
  redux.createStore<MarkdownWidgetStoreState, MarkdownWidgetStore>(
    info.name,
    MarkdownWidgetStore,
  );
  redux.createActions<MarkdownWidgetStoreState, MarkdownWidgetActions>(
    info.name,
    MarkdownWidgetActions,
  );
}

// separate string, in particular the `>` char is ambiguous in newer TSX
export const TIP_TEXT = `\
You may enter (Github flavored) markdown here. In particular, use #
for headings, > for block quotes, *'s for italic text, **'s for bold
text, - at the beginning of a line for lists, back ticks \` for code,
and URL's will automatically become links.`;

interface ReactProps {
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

interface ReduxProps {
  open_inputs: Map<any, any>;
}

interface MarkdownInputState {
  editing?: boolean;
  value: string;
}

class MarkdownInput0 extends Component<
  ReactProps & ReduxProps,
  MarkdownInputState
> {
  displayName: "WidgetMarkdownInput";

  constructor(props) {
    super(props);
    this.state = this.getInitialState();
  }

  static reduxProps() {
    return {
      markdown_inputs: {
        open_inputs: rtypes.immutable.Map.isRequired,
      },
    };
  }

  getInitialState = () => {
    let value = this.props.default_value ?? "";
    let editing = false;
    if (
      this.props.persist_id &&
      this.props.open_inputs.has(this.props.persist_id)
    ) {
      value = this.props.open_inputs.get(this.props.persist_id);
      editing = true;
    }

    return {
      editing,
      value,
    };
  };

  getActions() {
    return redux.getActions<MarkdownWidgetStoreState, MarkdownWidgetActions>(
      info.name,
    );
  }

  componentDidMount() {
    if (
      this.props.attach_to &&
      !this.props.open_inputs.has(this.props.persist_id)
    ) {
      (redux as any)
        .getStore(this.props.attach_to)
        .on("destroy", this.clear_persist);
    }
  }

  componentWillUnmount() {
    if (
      this.props.persist_id != null &&
      !(this.state.editing || this.props.editing)
    ) {
      this.clear_persist();
    }
  }

  persist_value = (value) => {
    if (this.props.persist_id != null) {
      this.getActions().set_value(
        this.props.persist_id,
        value ?? this.state.value,
      );
    }
  };

  clear_persist = () => {
    if (this.props.persist_id != null) {
      this.getActions().clear(this.props.persist_id);
    }
  };

  set_value = (value) => {
    if (typeof this.props.on_change === "function") {
      this.props.on_change(value);
    }
    this.persist_value(value);
    this.setState({ value });
  };

  edit = () => {
    if (typeof this.props.on_edit === "function") {
      this.props.on_edit(this.state.value);
    }
    if (this.props.editing == null) {
      this.setState({ editing: true });
    }
    this.setState({ value: this.props.default_value ?? "" });
  };

  cancel = () => {
    if (typeof this.props.on_cancel === "function") {
      this.props.on_cancel(this.state.value);
    }
    this.clear_persist();
    if (this.props.editing == null) {
      this.setState({ editing: false });
    }
  };

  save = () => {
    if (typeof this.props.on_save === "function") {
      this.props.on_save(this.state.value);
    }
    this.clear_persist();
    if (this.props.editing == null) {
      this.setState({ editing: false });
    }
  };

  keydown = (e) => {
    if (e.keyCode === 27) {
      this.cancel();
    } else if (e.keyCode === 13) {
      if (this.props.rows == 1 || e.shiftKey) {
        this.save();
      }
    }
  };

  to_html = () => {
    if (this.props.default_value) {
      const html = markdown_to_html(this.props.default_value);
      return { __html: html };
    } else {
      return { __html: "" };
    }
  };

  render() {
    if (this.state.editing || this.props.editing) {
      const tip = <span>{TIP_TEXT}</span>;
      return (
        <div>
          <Input.TextArea
            autoFocus={this.props.autoFocus ?? true}
            rows={this.props.rows ?? 4}
            placeholder={this.props.placeholder}
            value={this.state.value}
            onChange={(e) => {
              this.set_value(e.target.value);
            }}
            onKeyDown={this.keydown}
          />
          <div style={{ paddingTop: "8px", color: "#666" }}>
            <Tip title="Use Markdown" tip={tip}>
              Format using{" "}
              <a href={info.guide_link} target="_blank">
                Markdown
              </a>
            </Tip>
          </div>
          <Space style={{ paddingBottom: "5px" }}>
            <Button key="cancel" onClick={this.cancel}>
              Cancel
            </Button>
            <Button
              key="save"
              type="primary"
              onClick={this.save}
              disabled={
                this.props.save_disabled ??
                this.state.value === this.props.default_value
              }
            >
              <Icon name="edit" /> Save
            </Button>
          </Space>
        </div>
      );
    } else {
      let style;
      const html = this.to_html();
      if (html?.__html) {
        style = this.props.rendered_style;
      } else {
        style = undefined;
      }
      return (
        <div>
          <div dangerouslySetInnerHTML={html} style={style} />
          {!this.props.hide_edit_button ? (
            <Button onClick={this.edit}>Edit</Button>
          ) : undefined}
        </div>
      );
    }
  }
}

const MarkdownInput = rclass<ReactProps>(MarkdownInput0);
export { MarkdownInput };
