/*
FrameTitleBar - title bar in a frame, in the frame tree
*/

import { List } from "immutable";
import {
  React,
  Rendered,
  Component,
  redux,
  rclass,
  rtypes
} from "../../app-framework";
import { is_safari } from "../generic/browser";
import * as CSS from "csstype";

import { SaveButton } from "./save-button";

const { debounce } = require("underscore");
const { ButtonGroup, Button } = require("react-bootstrap");

import * as antd from "cocalc-ui";

import { get_default_font_size } from "../generic/client";
const { VisibleMDLG, EditorFileInfoDropdown } = require("smc-webapp/r_misc");

import { r_join } from "smc-webapp/r_misc/r_join";
import { Icon } from "smc-webapp/r_misc/icon";
import { Space } from "smc-webapp/r_misc/space";
import { Tip } from "smc-webapp/r_misc/tip";

const { IS_TOUCH } = require("smc-webapp/feature");
const misc = require("smc-util/misc");

import { FORMAT_SOURCE_ICON } from "../frame-tree/config";

import { path_split, trunc_middle } from "smc-util/misc2";

import { ConnectionStatus, EditorSpec, EditorDescription } from "./types";

// TODO:
// import { Actions } from "../code-editor/actions";

import { AvailableFeatures } from "../../project_configuration";

const COL_BAR_BACKGROUND = "#f8f8f8";
const COL_BAR_BACKGROUND_DARK = "#ddd";
const COL_BAR_BORDER = "rgb(204,204,204)";

const title_bar_style: CSS.Properties = {
  background: COL_BAR_BACKGROUND_DARK,
  border: `1px solid ${COL_BAR_BORDER}`,
  padding: "1px",
  flexDirection: "row",
  flexWrap: "nowrap",
  flex: "0 0 auto",
  display: "flex",
  minHeight: "34px"
};

const path_style: CSS.Properties = {
  whiteSpace: "nowrap" as "nowrap",
  fontSize: "13px",
  paddingRight: "15px",
  color: "#333",
  float: "right" as "right"
};

const TITLE_STYLE: CSS.Properties = {
  background: COL_BAR_BACKGROUND_DARK,
  padding: "5px 5px 0 5px",
  color: "#333",
  fontSize: "10pt",
  /*  float: "right", */
  whiteSpace: "nowrap",
  flex: "1 1 auto",
  textAlign: "right",
  display: "inline-block"
};

const CONNECTION_STATUS_STYLE: CSS.Properties = {
  padding: "5px 5px 0 5px",
  fontSize: "10pt",
  float: "right"
};

function connection_status_color(status: ConnectionStatus): string {
  switch (status) {
    case "disconnected":
      return "rgb(255, 0, 0)";
    case "connecting":
      return "rgb(255, 165, 0)";
    case "connected":
      return "#666";
    default:
      return "rgb(255, 165, 0)";
  }
}

const ICON_STYLE: CSS.Properties = {
  width: "20px",
  display: "inline-block"
};

const close_style: CSS.Properties | undefined = (function() {
  if (IS_TOUCH) {
    return undefined;
  } else {
    return {
      background: "transparent",
      borderColor: "transparent"
    };
  }
})();

interface Props {
  actions: any; // TODO -- see above Actions;
  editor_actions: any; // TODO -- see above Actions;
  path: string;
  project_id: string; // assumed to not change for now
  active_id: string;
  id: string;
  is_full: boolean;
  is_only: boolean; // is the only frame
  is_public: boolean; // public view of a file
  is_paused: boolean;
  type: string;
  spec: EditorDescription;
  editor_spec: EditorSpec;
  status: string;
  title?: string;
  connection_status?: ConnectionStatus;
  font_size?: number;
  available_features?: AvailableFeatures;
}

// state that is associated with the file being edited, not the
// frame tree/tab in which this sits.  Note some more should
// probably be moved down here...
interface ReduxProps {
  // These come from editor_actions's store:
  read_only: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  is_saving: boolean;
  is_public: boolean;
  // comes from actions's store:
  switch_to_files: List<string>;
}

interface State {
  close_and_halt_confirm?: boolean;
}

class FrameTitleBar extends Component<Props & ReduxProps, State> {
  private buttons?: { [button_name: string]: true };

  constructor(props) {
    super(props);
    this.state = { close_and_halt_confirm: false };
  }

  static reduxProps({ editor_actions, actions }) {
    if (editor_actions == null) throw Error("editor_actions must be specified");
    const name = editor_actions.name;
    if (name == null) throw Error("editor_actions must have name attribute");
    const name2 = actions.name;
    if (name2 == null) throw Error("actions must have name attribute");

    // The code below is a bit confusing because name may or
    // may not equal name2, and if they *are* equal and we were
    // to just make an object with the same key twice, the values
    // obviously wouldn't be merged.
    const spec: any = {
      [name]: {
        read_only: rtypes.bool,
        has_unsaved_changes: rtypes.bool,
        has_uncommitted_changes: rtypes.bool,
        is_saving: rtypes.bool,
        is_public: rtypes.bool
      }
    };
    if (name == name2) {
      spec[name2].switch_to_files = rtypes.immutable.List;
    } else {
      spec[name2] = {
        switch_to_files: rtypes.immutable.List
      };
    }
    return spec;
  }

  shouldComponentUpdate(next, state): boolean {
    return (
      misc.is_different(this.props, next, [
        "active_id",
        "id",
        "is_full",
        "is_only",
        "read_only",
        "has_unsaved_changes",
        "has_uncommitted_changes",
        "is_public",
        "is_saving",
        "is_paused",
        "type",
        "status",
        "title",
        "connection_status",
        "font_size",
        "available_features",
        "switch_to_files",
        "path"
      ]) || misc.is_different(this.state, state, ["close_and_halt_confirm"])
    );
  }

  is_visible(action_name: string, explicit?: boolean): boolean {
    if (this.props.editor_actions[action_name] == null) {
      return false;
    }

    if (this.buttons == null) {
      let buttons = this.props.spec.buttons;
      if (!explicit && buttons == null) {
        return true;
      }
      this.buttons =
        typeof buttons == "function" ? buttons(this.props.path) : buttons;
    }
    return this.buttons != null ? !!this.buttons[action_name] : false;
  }

  click_close(): void {
    this.props.actions.close_frame(this.props.id);
  }

  button_size(): string | undefined {
    if (this.props.is_only || this.props.is_full) {
      return;
    } else {
      return "small";
    }
  }

  render_x(): Rendered {
    const show_full =
      this.props.is_full || this.props.active_id === this.props.id;
    return (
      <Button
        title={"Close this frame"}
        style={!show_full ? close_style : undefined}
        key={"close"}
        bsSize={this.button_size()}
        onClick={() => this.click_close()}
      >
        <Icon name={"times"} />
      </Button>
    );
  }

  select_type(type: string): void {
    this.props.actions.set_frame_type(this.props.id, type);
  }

  render_types(): Rendered {
    const { Menu, Dropdown, Button } = antd;
    const selected_type: string = this.props.type;
    let selected_icon = "";
    let selected_short = "";
    const items: Rendered[] = [];
    for (const type in this.props.editor_spec) {
      const spec = this.props.editor_spec[type];
      if (this.props.is_public && spec.hide_public) {
        // editor that is explicitly excluded from public view for file, e.g., settings or terminal might use this.
        continue;
      }
      if (selected_type === type) {
        selected_icon = spec.icon;
        selected_short = spec.short;
      }
      const item = (
        <Menu.Item cocalc-test={type} key={type}>
          <Icon name={spec.icon ? spec.icon : "file"} style={ICON_STYLE} />{" "}
          {spec.name}
        </Menu.Item>
      );
      items.push(item);
    }

    let title = <Icon name={selected_icon} />;
    if (selected_short) {
      title = (
        <span>
          {title} {selected_short}
        </span>
      );
    }
    const menu = (
      <Menu
        onClick={e => this.select_type(e.key)}
        style={{ maxHeight: "100vH", overflow: "scroll" }}
      >
        {items}
      </Menu>
    );

    return (
      <Dropdown cocalc-test={"latex-dropdown"} overlay={menu} key={"types"}>
        <Button>
          {title} <antd.Icon type="down" />
        </Button>
      </Dropdown>
    );
  }

  render_control(): Rendered {
    const is_active = this.props.active_id === this.props.id;
    const style: CSS.Properties = {
      padding: 0,
      background: is_active ? COL_BAR_BACKGROUND : COL_BAR_BACKGROUND_DARK
    };
    if (is_active) {
      style.position = "absolute";
      style.boxShadow = "#ccc -3px 0";
      style.right = 0;
      style.zIndex = 10; // so can click see buttons when flow around
    }
    return (
      <ButtonGroup style={style} key={"close"}>
        {is_active ? this.render_types() : undefined}
        {is_active && !this.props.is_full ? this.render_split_row() : undefined}
        {is_active && !this.props.is_full ? this.render_split_col() : undefined}
        {is_active && !this.props.is_only ? this.render_full() : undefined}
        {this.render_x()}
      </ButtonGroup>
    );
  }

  render_full(): Rendered {
    if (this.props.is_full) {
      return (
        <Button
          disabled={this.props.is_only}
          title={"Show all frames"}
          key={"compress"}
          bsSize={this.button_size()}
          onClick={() => this.props.actions.unset_frame_full()}
        >
          <Icon name={"compress"} />
        </Button>
      );
    } else {
      return (
        <Button
          disabled={this.props.is_only}
          key={"expand"}
          title={"Show only this frame"}
          bsSize={this.button_size()}
          onClick={() => this.props.actions.set_frame_full(this.props.id)}
        >
          <Icon name={"expand"} />
        </Button>
      );
    }
  }

  render_split_row(): Rendered {
    return (
      <Button
        key={"split-row"}
        title={"Split frame horizontally into two rows"}
        bsSize={this.button_size()}
        onClick={e => {
          e.stopPropagation();
          if (this.props.is_full) {
            return this.props.actions.unset_frame_full();
          } else {
            return this.props.actions.split_frame("row", this.props.id);
          }
        }}
      >
        <Icon name="columns" rotate={"90"} />
      </Button>
    );
  }

  render_split_col(): Rendered {
    return (
      <Button
        key={"split-col"}
        title={"Split frame vertically into two columns"}
        bsSize={this.button_size()}
        onClick={e => {
          e.stopPropagation();
          if (this.props.is_full) {
            return this.props.actions.unset_frame_full();
          } else {
            return this.props.actions.split_frame("col", this.props.id);
          }
        }}
      >
        <Icon name="columns" />
      </Button>
    );
  }

  render_zoom_out(): Rendered {
    if (!this.is_visible("decrease_font_size")) {
      return;
    }
    return (
      <Button
        key={"font-increase"}
        title={"Decrease font size"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.decrease_font_size(this.props.id)}
      >
        <Icon name={"search-minus"} />
      </Button>
    );
  }

  render_zoom_in(): Rendered {
    if (!this.is_visible("increase_font_size")) {
      return;
    }
    return (
      <Button
        key={"font-decrease"}
        title={"Increase font size"}
        onClick={() => this.props.actions.increase_font_size(this.props.id)}
        bsSize={this.button_size()}
      >
        <Icon name={"search-plus"} />
      </Button>
    );
  }

  render_set_zoom(): Rendered {
    if (!this.is_visible("set_zoom")) {
      return;
    }

    const { Menu, Dropdown, Button, Icon } = antd;
    const items: Rendered[] = [100, 125, 150, 200].map(zoom => {
      return <Menu.Item key={zoom}>{`${zoom}%`}</Menu.Item>;
    });

    const title =
      this.props.font_size == null
        ? "Zoom"
        : `${Math.round(
            (100 * this.props.font_size) / get_default_font_size()
          )}%`;

    const menu = (
      <Menu
        onClick={e => {
          this.props.actions.set_zoom(parseInt(e.key) / 100, this.props.id);
        }}
        style={{ maxHeight: "100vH", overflow: "scroll" }}
      >
        {items}
      </Menu>
    );

    return (
      <Dropdown overlay={menu} key={"zoom-levels"}>
        <Button>
          {title} <Icon type="down" />
        </Button>
      </Dropdown>
    );
  }

  render_zoom_page_width(): Rendered {
    return (
      <Button
        key={"text-width"}
        title={"Zoom to page width"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.zoom_page_width(this.props.id)}
      >
        <Icon name={"arrows-alt-h"} />
      </Button>
    );
  }

  render_zoom_page_height(): Rendered {
    return (
      <Button
        key={"text-height"}
        title={"Zoom to page height"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.zoom_page_height(this.props.id)}
      >
        <Icon name={"arrows-alt-v"} />
      </Button>
    );
  }

  render_sync(): Rendered {
    if (!this.is_visible("sync") || this.props.actions.sync == null) {
      return;
    }
    const labels = this.show_labels();
    return (
      <Button
        key={"sync"}
        title={"Synchronize views (alt+enter)"}
        bsSize={this.button_size()}
        onClick={() =>
          this.props.actions.sync(this.props.id, this.props.editor_actions)
        }
      >
        <Icon name={"fab fa-staylinked"} />{" "}
        {labels ? <VisibleMDLG>Sync</VisibleMDLG> : undefined}
      </Button>
    );
  }

  render_switch_to_file(): Rendered {
    if (
      !this.is_visible("switch_to_file") ||
      this.props.actions.switch_to_file == null ||
      this.props.switch_to_files == null ||
      this.props.switch_to_files.size <= 1
    ) {
      return;
    }
    const { Menu, Dropdown, Button, Icon } = antd;
    const items: Rendered[] = [];
    this.props.switch_to_files.forEach(path => {
      items.push(
        <Menu.Item key={path}>
          {this.props.path == path ? <b>{path}</b> : path}
          {this.props.actions.path == path ? " (main)" : ""}
        </Menu.Item>
      );
    });
    const menu = (
      <Menu
        onClick={e => {
          this.props.actions.switch_to_file(e.key, this.props.id);
        }}
        style={{ maxHeight: "100vH", overflow: "scroll" }}
      >
        {items}
      </Menu>
    );
    const title = path_split(this.props.path).tail;
    return (
      <Dropdown overlay={menu} key={"switch-to-file"}>
        <Button style={{ top: "-9px", height: "30px" }}>
          {title} <Icon type="down" />
        </Button>
      </Dropdown>
    );
  }

  render_download(): Rendered {
    if (
      !this.is_visible("download") ||
      this.props.editor_actions.download == null
    ) {
      return;
    }
    const labels = this.show_labels();
    return (
      <Button
        key={"download"}
        title={"Download this file"}
        bsSize={this.button_size()}
        onClick={() => this.props.editor_actions.download(this.props.id)}
      >
        <Icon name={"cloud-download"} />{" "}
        {labels ? <VisibleMDLG>Download</VisibleMDLG> : undefined}
      </Button>
    );
  }

  render_replace(): Rendered {
    if (!this.is_visible("replace")) {
      return;
    }
    return (
      <Button
        key={"replace"}
        title={"Replace text"}
        onClick={() => this.props.editor_actions.replace(this.props.id)}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name="exchange" />
      </Button>
    );
  }

  render_find(): Rendered {
    if (!this.is_visible("find")) {
      return;
    }
    return (
      <Button
        key={"find"}
        title={"Find text"}
        onClick={() => this.props.editor_actions.find(this.props.id)}
        bsSize={this.button_size()}
      >
        <Icon name="search" />
      </Button>
    );
  }

  render_goto_line(): Rendered {
    if (!this.is_visible("goto_line")) {
      return;
    }
    return (
      <Button
        key={"goto-line"}
        title={"Jump to line"}
        onClick={() => this.props.editor_actions.goto_line(this.props.id)}
        bsSize={this.button_size()}
      >
        <Icon name="bolt" />
      </Button>
    );
  }

  render_find_replace_group(): Rendered {
    const v: Rendered[] = [];
    let x: Rendered;
    x = this.render_find();
    if (x) {
      v.push(x);
    }
    if (!this.props.is_public) {
      x = this.render_replace();
      if (x) {
        v.push(x);
      }
    }
    x = this.render_goto_line();
    if (x) {
      v.push(x);
    }
    if (v.length > 0) {
      return <ButtonGroup key={"find-group"}>{v}</ButtonGroup>;
    }
  }

  render_cut(): Rendered {
    if (!this.is_visible("cut")) {
      return;
    }
    return (
      <Button
        key={"cut"}
        title={"Cut selected"}
        onClick={() => this.props.editor_actions.cut(this.props.id)}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name={"scissors"} />
      </Button>
    );
  }

  render_paste(): Rendered {
    if (!this.is_visible("paste")) {
      return;
    }
    return (
      <Button
        key={"paste"}
        title={"Paste buffer"}
        onClick={debounce(
          () => this.props.editor_actions.paste(this.props.id, true),
          200,
          true
        )}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name={"paste"} />
      </Button>
    );
  }

  render_copy(): Rendered {
    if (!this.is_visible("copy")) {
      return;
    }
    return (
      <Button
        key={"copy"}
        title={"Copy selected"}
        onClick={() => this.props.editor_actions.copy(this.props.id)}
        bsSize={this.button_size()}
      >
        <Icon name={"copy"} />
      </Button>
    );
  }

  render_copy_group(): Rendered {
    const v: Rendered[] = [];
    let x: Rendered;
    if (!this.props.is_public) {
      x = this.render_cut();
      if (x) {
        v.push(x);
      }
    }
    if (this.is_visible("copy")) {
      v.push(this.render_copy());
    }
    if (!this.props.is_public) {
      x = this.render_paste();
      if (x) {
        v.push(x);
      }
    }
    if (v.length > 0) {
      return <ButtonGroup key={"copy"}>{v}</ButtonGroup>;
    }
  }

  render_zoom_group(): Rendered {
    if (!this.is_visible("decrease_font_size")) {
      return;
    }
    return (
      <ButtonGroup key={"zoom"}>
        {this.render_zoom_out()}
        {this.render_zoom_in()}
        {this.render_set_zoom()}
      </ButtonGroup>
    );
  }

  render_page_width_height_group(): Rendered {
    if (
      !this.is_visible("zoom_page_width") ||
      this.props.actions.zoom_page_width == null
    ) {
      return;
    }
    return (
      <ButtonGroup key={"height-width"}>
        {this.render_zoom_page_height()}
        {this.render_zoom_page_width()}
      </ButtonGroup>
    );
  }

  render_split_group(): Rendered {
    return (
      <ButtonGroup key={"split"}>
        {this.render_split_row()}
        {this.render_split_col()}
      </ButtonGroup>
    );
  }

  render_undo(): Rendered {
    if (!this.is_visible("undo")) {
      return;
    }
    return (
      <Button
        key={"undo"}
        title={"Undo last thing you did"}
        onClick={() => this.props.editor_actions.undo()}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name="undo" />
      </Button>
    );
  }

  render_redo(): Rendered {
    if (!this.is_visible("redo")) {
      return;
    }
    return (
      <Button
        key={"redo"}
        title={"Redo last thing you undid"}
        onClick={() => this.props.editor_actions.redo()}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name="repeat" />
      </Button>
    );
  }

  render_undo_redo_group(): Rendered {
    const v: Rendered[] = [];
    let x: Rendered;
    if ((x = this.render_undo())) v.push(x);
    if ((x = this.render_redo())) v.push(x);
    if (v.length > 0) {
      return <ButtonGroup key={"undo-group"}>{v}</ButtonGroup>;
    }
  }

  render_format_group(): Rendered {
    if (!this.is_visible("auto_indent")) {
      return;
    }
    return (
      <Button
        key={"auto-indent"}
        title={"Automatically format selected code"}
        onClick={() => this.props.editor_actions.auto_indent()}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name="indent" />
      </Button>
    );
  }

  private show_labels(): boolean {
    return this.props.is_only || this.props.is_full;
  }

  private button_text(button_name: string, def?: string): string | undefined {
    if (!this.show_labels()) return;
    const custom = this.props.editor_spec[this.props.type].customize_buttons;
    if (custom != null) {
      const x = custom[button_name];
      if (x != null && x.text != null) {
        return x.text;
      }
    }
    if (def != undefined) {
      return def;
    }
    return misc.capitalize(button_name);
  }

  private button_title(button_name: string, def?: string): string | undefined {
    const custom = this.props.editor_spec[this.props.type].customize_buttons;
    if (custom != null) {
      const x = custom[button_name];
      if (x != null && x.title != null) {
        return x.title;
      }
    }
    if (def != undefined) {
      return def;
    }
    return;
  }

  render_timetravel(labels): Rendered {
    if (!this.is_visible("time_travel")) {
      return;
    }
    return (
      <Button
        key={"timetravel"}
        title={"Show complete edit history"}
        bsStyle={"info"}
        bsSize={this.button_size()}
        onClick={event => {
          if (this.props.actions.name != this.props.editor_actions.name) {
            // a subframe editor -- always open time travel in a name tab.
            this.props.editor_actions.time_travel({ frame: false });
            return;
          }
          // If a time_travel frame type is available and the
          // user does NOT shift+click, then open as a frame.
          // Otherwise, it opens as a new tab.
          const frame =
            !event.shiftKey && this.props.editor_spec["time_travel"] != null;
          this.props.actions.time_travel({
            frame
          });
        }}
      >
        <Icon name="history" />{" "}
        <VisibleMDLG>{labels ? "TimeTravel" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_reload(labels): Rendered {
    if (!this.is_visible("reload", true)) {
      return;
    }
    return (
      <Button
        key={"reload"}
        title={"Reload this file"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.reload(this.props.id)}
      >
        <Icon name="sync" />
        <VisibleMDLG>{labels ? " Reload" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_help(labels: boolean): Rendered {
    if (!this.is_visible("help", true) || this.props.is_public) {
      return;
    }
    return (
      <Button
        key={"help"}
        title={"Show help for working with this type of document"}
        bsSize={this.button_size()}
        onClick={() =>
          typeof this.props.actions.help === "function"
            ? this.props.actions.help(this.props.type)
            : undefined
        }
      >
        <Icon name="question-circle" />{" "}
        <VisibleMDLG>{labels ? "Help" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_restart(): Rendered {
    if (!this.is_visible("restart", true)) {
      return;
    }
    const labels = this.show_labels();
    return (
      <Button
        key={"restart"}
        title={"Restart service"}
        bsSize={this.button_size()}
        onClick={() => this.props.editor_actions.restart()}
      >
        <Icon name="sync" />{" "}
        {labels ? <VisibleMDLG>Restart</VisibleMDLG> : undefined}
      </Button>
    );
  }

  render_save(labels: boolean): Rendered {
    if (!this.is_visible("save")) {
      return;
    }
    return (
      <SaveButton
        key="save"
        has_unsaved_changes={this.props.has_unsaved_changes}
        has_uncommitted_changes={this.props.has_uncommitted_changes}
        read_only={this.props.read_only}
        is_public={this.props.is_public}
        is_saving={this.props.is_saving}
        no_labels={!labels}
        size={this.button_size()}
        onClick={() => {
          this.props.editor_actions.save(true);
          this.props.actions.explicit_save();
          this.props.actions.focus(this.props.id);
        }}
      />
    );
  }

  render_save_timetravel_group(): Rendered {
    const labels = this.show_labels();
    const v: Rendered[] = [];
    let x: Rendered;
    if ((x = this.render_save(labels))) v.push(x);
    if (!this.props.is_public) {
      if ((x = this.render_timetravel(labels))) v.push(x);
    }
    if ((x = this.render_reload(labels))) v.push(x);
    if (v.length > 0) {
      return <ButtonGroup key={"save-group"}>{v}</ButtonGroup>;
    }
  }

  render_format(): Rendered {
    if (!this.is_visible("format")) return;
    let desc: any = this.props.editor_actions.has_format_support(
      this.props.id,
      this.props.available_features
    );
    if (!desc) return;
    if (desc === true) {
      desc = "Canonically format the entire document.";
    }
    return (
      <Button
        key={"format"}
        bsSize={this.button_size()}
        onClick={() => this.props.editor_actions.format(this.props.id)}
        title={desc}
      >
        <Icon name={FORMAT_SOURCE_ICON} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Format" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_table_of_contents(): Rendered {
    if (!this.is_visible("show_table_of_contents")) return;
    return (
      <Button
        key={"contents"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.show_table_of_contents(this.props.id)}
        title={"Show the Table of Contents"}
      >
        <Icon name={"align-right"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Contents" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_build(): Rendered {
    if (!this.is_visible("build", true)) {
      return;
    }
    return (
      <Button
        key={"build"}
        disabled={!!this.props.status}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.build(this.props.id, false)}
        title={"Build project"}
      >
        <Icon name={"play-circle"} /> <VisibleMDLG>Build</VisibleMDLG>
      </Button>
    );
  }

  render_force_build(): Rendered {
    if (!this.is_visible("force_build", true)) {
      return;
    }
    return (
      <Button
        key={"force-build"}
        disabled={!!this.props.status}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.force_build(this.props.id)}
        title={"Force rebuild entire project"}
      >
        <Icon name={"play"} /> <VisibleMDLG>Force Rebuild</VisibleMDLG>
      </Button>
    );
  }

  render_clean(): Rendered {
    if (!this.is_visible("clean", true)) {
      return;
    }
    return (
      <Button
        key={"clean"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.clean(this.props.id)}
        title={"Clean auxiliary build files"}
      >
        <Icon name={"trash"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Clean" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_count_words(): Rendered {
    if (!this.is_visible("word_count", true)) {
      return;
    }
    return (
      <Button
        key={"word_count"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.word_count(0, true)}
        title={"Runs texcount"}
      >
        <Icon name={"file-alt"} /> <VisibleMDLG>Count words</VisibleMDLG>
      </Button>
    );
  }

  render_kick_other_users_out(): Rendered {
    if (!this.is_visible("kick_other_users_out")) {
      return;
    }
    return (
      <Button
        key={"kick_other_users_out"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.kick_other_users_out(this.props.id)}
        title={"Kick all other users out"}
      >
        <Icon name={"door-open"} />
      </Button>
    );
  }

  render_pause(labels): Rendered {
    if (!this.is_visible("pause")) {
      return;
    }
    let icon: string, title: string, style: string | undefined;
    if (this.props.is_paused) {
      icon = "play";
      title = "Play";
      style = "success";
    } else {
      icon = "pause";
      title = "Pause";
    }
    return (
      <Button
        key={"pause"}
        bsSize={this.button_size()}
        bsStyle={style}
        onClick={() => {
          if (this.props.is_paused) {
            this.props.actions.unpause(this.props.id);
          } else {
            this.props.actions.pause(this.props.id);
          }
        }}
        title={title}
      >
        <Icon name={icon} />
        <VisibleMDLG>{labels ? " " + title : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_edit_init_script(): Rendered {
    if (!this.is_visible("edit_init_script")) {
      return;
    }
    return (
      <Button
        key={"edit_init_script"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.edit_init_script(this.props.id)}
        title={"Edit initialization script"}
      >
        <Icon name={"rocket"} />{" "}
      </Button>
    );
  }

  render_close_and_halt(labels: boolean): Rendered {
    if (!this.is_visible("close_and_halt")) {
      return;
    }
    return (
      <Button
        key={"close_and_halt"}
        disabled={this.state.close_and_halt_confirm}
        bsSize={this.button_size()}
        onClick={() => this.setState({ close_and_halt_confirm: true })}
        title={"Close and halt server"}
      >
        <Icon name={"hand-stop-o"} />{" "}
        <VisibleMDLG>{labels ? "Halt" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_print(): Rendered {
    if (!this.is_visible("print")) {
      return;
    }
    return (
      <Button
        key={"print"}
        bsSize={this.button_size()}
        onClick={() => this.props.editor_actions.print(this.props.id)}
        title={"Print file..."}
      >
        <Icon name={"print"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Print" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_shell(): Rendered {
    if (!this.is_visible("shell")) {
      return;
    }
    return (
      <Button
        key={"shell"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.shell(this.props.id)}
        title={this.button_title("shell", "Open a shell for running this code")}
      >
        <Icon name={"terminal"} />{" "}
        <VisibleMDLG>{this.button_text("shell")}</VisibleMDLG>
      </Button>
    );
  }

  render_file_menu(): Rendered {
    if (!(this.props.is_only || this.props.is_full)) {
      return;
    }
    const spec = this.props.editor_spec[this.props.type];
    if (spec != null && spec.hide_file_menu) return;
    return (
      <EditorFileInfoDropdown
        key={"info"}
        title={"File related actions"}
        filename={this.props.path}
        actions={redux.getProjectActions(this.props.project_id)}
        is_public={false}
        label={"File"}
        bsSize={this.button_size()}
      />
    );
  }

  render_buttons(): Rendered {
    let style;
    if (!(this.props.is_only || this.props.is_full)) {
      // When in split view, we let the buttonbar flow around and hide, so that
      // extra buttons are cleanly not visible when frame is thin.
      style = {
        maxHeight: "30px"
      };
    } else {
      style = {
        maxHeight: "34px",
        marginLeft: "2px"
      };
    }

    const labels = this.show_labels();

    const v: Rendered[] = [];
    v.push(this.render_save_timetravel_group());
    v.push(this.render_build());
    v.push(this.render_force_build());
    v.push(this.render_sync());
    v.push(this.render_switch_to_file());
    v.push(this.render_clean());
    if (!this.props.is_public) {
      v.push(this.render_undo_redo_group());
    }
    v.push(this.render_zoom_group());
    v.push(this.render_restart());
    v.push(this.render_close_and_halt(labels));

    v.push(this.render_page_width_height_group());
    v.push(this.render_download());
    v.push(this.render_pause(labels));
    v.push(this.render_copy_group());
    v.push(this.render_find_replace_group());
    if (!this.props.is_public) {
      v.push(this.render_format_group());
    }
    v.push(this.render_edit_init_script());
    v.push(this.render_count_words());
    v.push(this.render_table_of_contents());
    v.push(this.render_kick_other_users_out());
    v.push(this.render_format());
    v.push(this.render_shell());
    v.push(this.render_print());
    v.push(this.render_help(labels));

    const w: Rendered[] = [];
    for (const c of v) {
      if (c != null) {
        w.push(c);
      }
    }

    return (
      <div
        style={style}
        key={"buttons"}
        className={"cc-frame-tree-title-bar-buttons"}
      >
        {r_join(w, <Space />)}
      </div>
    );
  }

  render_path(): Rendered {
    return (
      <span style={path_style}>
        <Tip placement={"bottom"} title={this.props.path}>
          {misc.path_split(this.props.path).tail}
        </Tip>
      </span>
    );
  }

  render_main_buttons(): Rendered {
    // This is complicated below (with the flex display) in order to have a drop down menu that actually appears
    // and *ALSO* have buttons that vanish when there are many of them.
    const style: CSS.Properties = {
      flex: "1 1 auto" /* controls shrink to the right due to 0 0 auto*/,
      flexFlow: "row nowrap",
      display: "flex"
    };
    return (
      <div style={style}>
        {!this.props.is_public ? this.render_file_menu() : undefined}
        {this.render_buttons()}
      </div>
    );
  }

  render_connection_status(is_active: boolean): Rendered | undefined {
    if (
      !this.props.connection_status ||
      !this.is_visible("connection_status", true)
    ) {
      return;
    }
    if (this.props.connection_status == "connected") {
      // To reduce clutter show nothing when connected.
      // NOTE: Keep this consistent with
      // cocalc/src/smc-webapp/project/websocket/websocket-indicator.tsx
      return;
    }

    const style = is_active
      ? Object.assign({}, CONNECTION_STATUS_STYLE, {
          background: COL_BAR_BACKGROUND
        })
      : CONNECTION_STATUS_STYLE;

    return (
      <span style={style} title={this.props.connection_status}>
        <Icon
          style={{
            color: connection_status_color(this.props.connection_status)
          }}
          name={"wifi"}
        />
      </span>
    );
  }

  render_title(is_active: boolean): Rendered {
    let title: string = "";
    let icon: string = "";
    if (this.props.title !== undefined) {
      title = this.props.title;
    }
    if (this.props.editor_spec != null) {
      const spec = this.props.editor_spec[this.props.type];
      if (spec != null) {
        icon = spec.icon;
        if (!title) {
          if (spec.name) {
            title = spec.name;
          } else if (spec.short) {
            title = spec.short;
          }
        }
      }
    }

    const style = is_active
      ? Object.assign({}, TITLE_STYLE, { background: COL_BAR_BACKGROUND })
      : TITLE_STYLE;

    return (
      <div style={style}>
        {icon ? <Icon name={icon} /> : null}
        <Space />
        {trunc_middle(title, 25)}
      </div>
    );
  }

  render_close_and_halt_confirm(): Rendered {
    if (!this.state.close_and_halt_confirm) return;
    return (
      <div
        style={{
          padding: "5px",
          borderBottom: "1px solid lightgrey",
          position: "absolute",
          width: "100%",
          zIndex: 100,
          background: "white",
          boxShadow: "rgba(0, 0, 0, 0.25) 0px 6px 24px"
        }}
      >
        Halt the server and close this?
        <Button
          onClick={() => {
            this.setState({ close_and_halt_confirm: false });
            this.props.actions.close_and_halt(this.props.id);
          }}
          style={{
            marginLeft: "20px",
            marginRight: "5px"
          }}
          bsStyle="danger"
        >
          <Icon name={"hand-stop-o"} /> Close and Halt
        </Button>
        <Button
          onClick={() => this.setState({ close_and_halt_confirm: false })}
        >
          Cancel
        </Button>
      </div>
    );
  }

  render_confirm_bar(): Rendered {
    return (
      <div style={{ position: "relative" }}>
        {this.render_close_and_halt_confirm()}
      </div>
    );
  }

  render(): Rendered {
    // Whether this is *the* active currently focused frame:
    let style;
    const is_active = this.props.id === this.props.active_id;
    if (is_active) {
      style = misc.copy(title_bar_style);
      style.background = COL_BAR_BACKGROUND;
      if (!this.props.is_only && !this.props.is_full) {
        style.maxHeight = "34px";
      }
      // position relative, so we can absolute position the
      // frame controls to the right
      style.position = "relative";
    } else {
      style = title_bar_style;
    }

    if (is_safari()) {
      // ugly hack....
      // for some reason this is really necessary on safari, but
      // breaks on everything else!
      if (!is_active) {
        style = misc.copy(style);
      }
      if (this.props.is_only || this.props.is_full) {
        style.minHeight = "36px";
      } else {
        style.minHeight = "32px";
      }
    }

    return (
      <>
        <div
          style={style}
          id={`titlebar-${this.props.id}`}
          className={"cc-frame-tree-title-bar"}
        >
          {is_active ? this.render_main_buttons() : undefined}
          {this.props.title ? this.render_title(is_active) : undefined}
          {!is_active && !this.props.title
            ? this.render_title(is_active)
            : undefined}
          {this.render_connection_status(is_active)}
          {this.render_control()}
        </div>
        {this.render_confirm_bar()}
      </>
    );
  }
}

const tmp = rclass(FrameTitleBar);
export { tmp as FrameTitleBar };
