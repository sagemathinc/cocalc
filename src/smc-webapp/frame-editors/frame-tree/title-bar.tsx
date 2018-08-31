/*
FrameTitleBar - title bar in a frame, in the frame tree
*/

import { React, Rendered, Component, redux } from "../../app-framework";
import { is_safari } from "../generic/browser";
import * as CSS from "csstype";

let close_style;
const { debounce } = require("underscore");
const {
  ButtonGroup,
  Button,
  DropdownButton,
  MenuItem
} = require("react-bootstrap");

const {
  r_join,
  Icon,
  Space,
  Tip,
  VisibleMDLG,
  EditorFileInfoDropdown
} = require("smc-webapp/r_misc");

const {
  UncommittedChanges
} = require("smc-webapp/jupyter/uncommitted-changes");

const { IS_TOUCH } = require("smc-webapp/feature");
const misc = require("smc-util/misc");

const util = require("../frame-tree/util");

const title_bar_style: CSS.Properties = {
  background: "#ddd",
  border: "1px solid rgb(204,204,204)",
  padding: "1px"
};

const path_style: CSS.Properties = {
  whiteSpace: "nowrap" as "nowrap",
  fontSize: "13px",
  paddingRight: "15px",
  color: "#333",
  float: "right" as "right"
};

const TITLE_STYLE: CSS.Properties = {
  padding: "5px 5px 0 5px",
  color: "#333",
  fontSize: "10pt",
  display: "inline-block",
  float: "right"
};

const ICON_STYLE: CSS.Properties = {
  width: "20px",
  display: "inline-block"
};

if (IS_TOUCH) {
  close_style = undefined;
} else {
  close_style = {
    background: "transparent",
    borderColor: "transparent"
  };
}

interface Props {
  actions: any;
  path: string; // assumed to not change for now
  project_id: string; // assumed to not change for now
  active_id: string;
  id: string;
  deletable: boolean;
  read_only: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  is_saving: boolean;
  is_full: boolean;
  is_only: boolean; // is the only frame
  is_public: boolean; // public view of a file
  type: string;
  editor_spec: any;
  status: string;
  title?: string;
}

export class FrameTitleBar extends Component<Props, {}> {
  shouldComponentUpdate(next): boolean {
    return misc.is_different(this.props, next, [
      "active_id",
      "id",
      "deletable",
      "is_full",
      "is_only",
      "read_only",
      "has_unsaved_changes",
      "has_uncommitted_changes",
      "is_public",
      "is_saving",
      "type",
      "status",
      "title"
    ]);
  }

  is_visible(action_name: string, explicit?: boolean): boolean {
    const buttons = this.props.editor_spec[this.props.type].buttons;
    if (!explicit && buttons == null) {
      return true;
    }
    if (!this.props.actions[action_name]) {
      return false;
    }
    return buttons != null ? !!buttons[action_name] : false;
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
    if (this.props.editor_spec == null) {
      return;
    }

    const selected_type: string = this.props.type;
    let selected_icon = "";
    let selected_short = "";
    const items: Rendered[] = [];
    for (let type in this.props.editor_spec) {
      const spec = this.props.editor_spec[type];
      if (selected_type === type) {
        selected_icon = spec.icon;
        selected_short = spec.short;
      }
      const item = (
        <MenuItem
          selected={selected_type === type}
          key={type}
          eventKey={type}
          onSelect={type => this.select_type(type)}
        >
          <Icon name={spec.icon} style={ICON_STYLE} /> {spec.name}
        </MenuItem>
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
    return (
      <DropdownButton
        title={title}
        key={"types"}
        id={"types"}
        bsSize={this.button_size()}
      >
        {items}
      </DropdownButton>
    );
  }

  render_control(): Rendered {
    const is_active = this.props.active_id === this.props.id;
    return (
      <ButtonGroup style={{ float: "right" }} key={"close"}>
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
        onClick={() => this.props.actions.sync(this.props.id)}
      >
        <Icon name={"fab fa-staylinked"} />{" "}
        {labels ? <VisibleMDLG>Sync</VisibleMDLG> : undefined}
      </Button>
    );
  }

  render_download(): Rendered {
    if (!this.is_visible("download") || this.props.actions.download == null) {
      return;
    }
    const labels = this.show_labels();
    return (
      <Button
        key={"download"}
        title={"Download this file"}
        bsSize={this.button_size()}
        onClick={() => this.props.actions.download(this.props.id)}
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
        onClick={() => this.props.actions.replace(this.props.id)}
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
        onClick={() => this.props.actions.find(this.props.id)}
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
        onClick={() => this.props.actions.goto_line(this.props.id)}
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
        title={"Cut selected text"}
        onClick={() => this.props.actions.cut(this.props.id)}
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
          () => this.props.actions.paste(this.props.id),
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
        title={"Copy selected text"}
        onClick={() => this.props.actions.copy(this.props.id)}
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
        onClick={() => this.props.actions.undo()}
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
        title={"Redo last thing you did"}
        onClick={() => this.props.actions.redo()}
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
        onClick={() => this.props.actions.auto_indent()}
        disabled={this.props.read_only}
        bsSize={this.button_size()}
      >
        <Icon name="indent" />
      </Button>
    );
  }

  show_labels(): boolean {
    return this.props.is_only || this.props.is_full;
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
        onClick={() => this.props.actions.time_travel()}
      >
        <Icon name="history" />{" "}
        <VisibleMDLG>{labels ? "TimeTravel" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  // Button to reload the document
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
        <Icon name="repeat" />{" "}
        <VisibleMDLG>{labels ? "Reload" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  // A "Help" info button
  render_help(): Rendered {
    if (!this.is_visible("help", true) || this.props.is_public) {
      return;
    }
    let labels = this.show_labels();
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

  render_save(labels: boolean): Rendered {
    let icon, label;
    if (!this.is_visible("save")) {
      return;
    }
    const disabled =
      !this.props.has_unsaved_changes ||
      this.props.read_only ||
      this.props.is_public;
    if (labels) {
      if (this.props.is_public) {
        label = "Public";
      } else if (this.props.read_only) {
        label = "Readonly";
      } else {
        label = "Save";
      }
    } else {
      label = "";
    }
    if (this.props.is_saving) {
      icon = "arrow-circle-o-left";
    } else {
      icon = "save";
    }

    // The funny style in the icon below is because the width changes slightly depending
    // on which icon we are showing.
    return (
      <Button
        key={"save"}
        title={"Save file to disk"}
        bsStyle={"success"}
        bsSize={this.button_size()}
        disabled={disabled}
        onClick={() => {
          this.props.actions.save(true);
          this.props.actions.focus(this.props.id);
        }}
      >
        <Icon name={icon} style={{ width: "15px", display: "inline-block" }} />{" "}
        <VisibleMDLG>{label}</VisibleMDLG>
        <UncommittedChanges
          has_uncommitted_changes={this.props.has_uncommitted_changes}
        />
      </Button>
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
    if (
      !this.is_visible("format") ||
      !util.PRETTIER_SUPPORT[misc.filename_extension(this.props.path)]
    ) {
      return;
    }
    return (
      <Button
        bsSize={this.button_size()}
        key={"format"}
        onClick={() => this.props.actions.format(this.props.id)}
        title={
          "Run Prettier (or some other AST-based service) to canonically format this entire document"
        }
      >
        <Icon name={"fa-sitemap"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Format" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_build(): Rendered {
    if (!this.is_visible("build", true)) {
      return;
    }
    return (
      <Button
        disabled={!!this.props.status}
        bsSize={this.button_size()}
        key={"build"}
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
        disabled={!!this.props.status}
        bsSize={this.button_size()}
        key={"force-build"}
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
        bsSize={this.button_size()}
        key={"clean"}
        onClick={() => this.props.actions.clean(this.props.id)}
        title={"Clean auxiliary build files"}
      >
        <Icon name={"trash"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Clean" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_print(): Rendered {
    if (!this.is_visible("print")) {
      return;
    }
    return (
      <Button
        bsSize={this.button_size()}
        key={"print"}
        onClick={() => this.props.actions.print(this.props.id)}
        title={"Print file to PDF"}
      >
        <Icon name={"print"} />{" "}
        <VisibleMDLG>{this.show_labels() ? "Print" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  render_file_menu(): Rendered {
    if (!(this.props.is_only || this.props.is_full)) {
      return;
    }
    return (
      <EditorFileInfoDropdown
        key={"info"}
        title={"File` related actions"}
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
      style = { maxHeight: "30px", overflow: "hidden", flex: 1 };
    } else {
      style = {
        maxHeight: "34px",
        overflow: "hidden",
        flex: 1,
        marginLeft: "2px"
      };
    }
    const v: Rendered[] = [];
    v.push(this.render_save_timetravel_group());
    v.push(this.render_build());
    v.push(this.render_force_build());
    v.push(this.render_sync());
    v.push(this.render_clean());
    v.push(this.render_format());
    if (!this.props.is_public) {
      v.push(this.render_undo_redo_group());
    }
    v.push(this.render_zoom_group());
    v.push(this.render_page_width_height_group());
    v.push(this.render_download());
    v.push(this.render_copy_group());
    v.push(this.render_find_replace_group());
    if (!this.props.is_public) {
      v.push(this.render_format_group());
    }
    v.push(this.render_help());
    v.push(this.render_print());

    const w: Rendered[] = [];
    for (let c of v) {
      if (c != null) {
        w.push(c);
      }
    }

    return (
      <div style={style} key={"buttons"}>
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
    // and *ALSO* have buttons that vanish when there are many of them (via scrolling around).
    return (
      <div style={{ display: "flex" }}>
        {!this.props.is_public ? this.render_file_menu() : undefined}
        {this.render_buttons()}
      </div>
    );
  }

  render_title(): Rendered {
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
          if (spec.title) {
            title = spec.title;
          } else if (spec.name) {
            title = spec.name;
          } else if (spec.short) {
            title = spec.short;
          }
        }
      }
    }
    return (
      <span style={TITLE_STYLE}>
        {icon ? <Icon name={icon} /> : null}
        <Space />
        {title}
      </span>
    );
  }

  render(): Rendered {
    // Whether this is *the* active currently focused frame:
    let style;
    const is_active = this.props.id === this.props.active_id;
    if (is_active) {
      style = misc.copy(title_bar_style);
      style.background = "#f8f8f8";
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
      <div style={style} id={`titlebar-${this.props.id}`}>
        {this.render_control()}
        {this.props.title ? this.render_title() : undefined}
        {is_active ? this.render_main_buttons() : undefined}
        {!is_active && !this.props.title ? this.render_title() : undefined}
      </div>
    );
  }
}
