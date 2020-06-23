/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
X11 Window frame.
*/

import { Map, Set } from "immutable";

import { delay } from "awaiting";

import {
  React,
  Component,
  ReactDOM,
  Rendered,
  rclass,
  rtypes,
} from "../../app-framework";

import { debounce } from "underscore";
import { cmp, is_different } from "smc-util/misc2";
import { Actions } from "./actions";
import { WindowTab } from "./window-tab";
import { TAB_BAR_GREY } from "./theme";
import { Loading } from "smc-webapp/r_misc";
import { retry_until_success } from "smc-util/async-utils";

interface Props {
  actions: Actions;
  id: string;
  desc: Map<string, any>;
  is_current: boolean;
  font_size: number;
  reload: string;
  editor_settings: Map<string, any>;
  resize: number;
  // reduxProps:
  windows: Map<string, any>;
  x11_is_idle: boolean;
  disabled: boolean;
  config_unknown: boolean;
}

class X11Component extends Component<Props, {}> {
  private is_mounted: boolean = false;
  private is_loaded: boolean = false;
  private measure_size: Function;

  static displayName = "X11";

  static reduxProps({ name }) {
    return {
      [name]: {
        windows: rtypes.immutable.Map,
        x11_is_idle: rtypes.bool,
        disabled: rtypes.bool,
        config_unknown: rtypes.bool,
      },
    };
  }

  componentWillReceiveProps(next: Props): void {
    if (this.props.resize != next.resize) {
      this.measure_size();
    }
  }

  shouldComponentUpdate(next): boolean {
    if (
      this.props.editor_settings.get("physical_keyboard") !==
        next.editor_settings.get("physical_keyboard") ||
      this.props.editor_settings.get("keyboard_variant") !==
        next.editor_settings.get("keyboard_variant")
    ) {
      // keyboard layout change
      this.props.actions.set_physical_keyboard(
        next.editor_settings.get("physical_keyboard"),
        next.editor_settings.get("keyboard_variant")
      );
    }

    // focused on a frame
    if (!this.props.is_current && next.is_current) {
      this.focus_textarea();
    }

    // tab change (so different wid)
    if (this.props.desc.get("wid") != next.desc.get("wid")) {
      this.insert_window_in_dom(next);
      return true;
    }

    // just got loaded?
    if (!this.is_loaded && next.desc.get("wid") != null) {
      this.insert_window_in_dom(next);
    }

    // children changed?
    if (this.props.windows != null && this.props.windows !== next.windows) {
      const wid: number = next.desc.get("wid");
      const children = this.props.windows.getIn([wid, "children"], Set());
      const next_children = next.windows.getIn([wid, "children"], Set());
      if (this.is_loaded && !children.equals(next_children)) {
        this.insert_children_in_dom(next_children.subtract(children));
      }
    }

    // reload or font size change -- measure and resize again.
    if (
      this.props.desc.get("font_size") != next.desc.get("font_size") ||
      this.props.reload != next.reload
    ) {
      this.measure_size(next);
      return true;
    }

    // another other change causes re-render (e.g., of tab titles).
    return is_different(this.props, next, [
      "id",
      "windows",
      "is_current",
      "x11_is_idle",
      "disabled",
      "config_unknown",
    ]);
  }

  async componentDidMount(): Promise<void> {
    this.measure_size = debounce(this._measure_size.bind(this), 500);
    this.is_mounted = true;

    // "wait" until window node is available
    await retry_until_success({
      f: async () => {
        const node: any = ReactDOM.findDOMNode(this.refs.window);
        if (node == null) {
          throw new Error("x11 window node not yet available");
        }
      },
      max_time: 60000,
      max_delay: 150,
    });
    this.insert_window_in_dom(this.props);
    this.disable_browser_context_menu();

    // set keyboard layout
    this.props.actions.set_physical_keyboard(
      this.props.editor_settings.get("physical_keyboard"),
      this.props.editor_settings.get("keyboard_variant")
    );
  }

  disable_browser_context_menu(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable this...
    $(node).bind("contextmenu", function () {
      return false;
    });
  }

  async insert_window_in_dom(props: Props): Promise<void> {
    if (!this.is_mounted) {
      return;
    }
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    const client = props.actions.client;
    if (client == null) {
      // will never happen -- to satisfy typescript
      return;
    }
    const wid = props.desc.get("wid");
    if (wid == null) {
      this.is_loaded = false;
      $(node).empty();
      return;
    }
    try {
      client.insert_window_in_dom(wid, node);
    } catch (err) {
      // window not available right now.
      this.is_loaded = false;
      $(node).empty();
      return;
    }
    this.is_loaded = true;
    this.insert_children_in_dom(props.windows.getIn([wid, "children"], Set()));
    this._measure_size();
    await delay(0);
    if (!this.is_mounted || wid !== props.desc.get("wid")) {
      return;
    }
    this._measure_size();
    if (props.is_current) {
      client.focus_window(wid);
    }
  }

  insert_children_in_dom(wids: Set<number>): void {
    const client = this.props.actions.client;
    if (client == null) {
      // will never happen -- to satisfy typescript
      return;
    }
    wids.forEach((wid) => {
      client.insert_child_in_dom(wid);
    });
    this.measure_size();
  }

  _measure_size(props?: Props): void {
    if (props == null) {
      props = this.props;
    }
    const client = props.actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = props.desc.get("wid");
    if (wid == null) {
      return;
    }
    const node = $(ReactDOM.findDOMNode(this.refs.window));
    const width = node.width(),
      height = node.height();
    if (width == null || height == null) {
      return;
    }
    const frame_scale = props.font_size / 14;
    client.resize_window(wid, width, height, frame_scale);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
    this.is_loaded = false;
  }

  render_window_tabs(): Rendered[] {
    const v: Rendered[] = [];
    if (this.props.windows == null) {
      return v;
    }
    const wids = this.props.windows.keySeq().toJS();
    wids.sort(cmp); // since sort uses string cmp by default
    for (const wid of wids) {
      if (this.props.windows.getIn([wid, "parent"])) {
        // don't render a tab for modal dialogs (or windows on top of others that block them).
        continue;
      }
      v.push(
        <WindowTab
          id={this.props.id}
          key={wid}
          is_current={wid === this.props.desc.get("wid")}
          info={this.props.windows.get(wid)}
          actions={this.props.actions}
        />
      );
    }
    return v;
  }

  render_tab_bar(): Rendered {
    return (
      <div
        style={{
          borderBottom: "1px solid lightgrey",
          background: TAB_BAR_GREY,
          display: "inline-flex",
        }}
      >
        {this.render_window_tabs()}
      </div>
    );
  }

  render_window_div(): Rendered {
    return (
      <div
        className="smc-vfill"
        ref="window"
        style={{ position: "relative" }}
        onClick={() => {
          this.focus_textarea();
          // TODO:
          // const client = this.props.actions.client;
          // (client as any).client.mouse_inject(ev);
        }}
      />
    );
  }

  focus_textarea(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.focus);
    $(node).focus();
    const client = this.props.actions.client;
    if (client == null) {
      return;
    }
    client.focus();
  }

  textarea_blur(): void {
    const client = this.props.actions.client;
    if (client == null) {
      return;
    }
    client.blur();
  }

  on_paste(e): boolean {
    const value: string = e.clipboardData.getData("Text");
    this.props.actions.paste(this.props.id, value);
    return false;
  }

  render_hidden_textarea(): Rendered {
    return (
      <textarea
        style={{
          opacity: 0,
          position: "absolute",
          height: 0,
          width: 0,
          top: 0,
        }}
        aria-multiline="false"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={0}
        ref="focus"
        onBlur={() => this.textarea_blur()}
        onPaste={(e) => this.on_paste(e)}
      />
    );
  }

  not_idle(): void {
    this.props.actions.x11_not_idle();
  }

  render_idle(): Rendered {
    if (!this.props.x11_is_idle) {
      return;
    }
    return (
      <div
        onClick={this.not_idle.bind(this)}
        style={{
          position: "absolute",
          fontSize: "36pt",
          color: "white",
          backgroundColor: "#458ac9",
          textAlign: "center",
          width: "100%",
          height: "100%",
          cursor: "pointer",
          zIndex: 1,
          opacity: 0.7,
        }}
      >
        Idle
        <br />
        (click to resume)
      </div>
    );
  }

  render(): Rendered {
    if (this.props.disabled == null || this.props.config_unknown == null)
      return <Loading />;

    if (this.props.disabled) {
      const no_info = this.props.config_unknown
        ? "There is no X11 configuration information available. You might have to restart this project"
        : "";
      return (
        <div className="smc-vfill" style={{ padding: "100px auto auto auto" }}>
          X11 is not available for this project. {no_info}
        </div>
      );
    }
    return (
      <div className="smc-vfill" style={{ position: "relative" }}>
        {this.render_idle()}
        {this.render_tab_bar()}
        {this.render_hidden_textarea()}
        {this.render_window_div()}
      </div>
    );
  }
}

const X110 = rclass(X11Component);
export { X110 as X11 };
