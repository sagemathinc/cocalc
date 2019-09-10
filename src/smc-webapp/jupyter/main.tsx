/*
Top-level react component, which ties everything together
*/

import { React, Component, Rendered, rclass, rtypes } from "../app-framework";
import * as immutable from "immutable";

import { ErrorDisplay } from "../r_misc/error-display";
import { Loading } from "../r_misc/loading";

// React components that implement parts of the Jupyter notebook.
import { TopMenubar } from "./top-menubar";
import { TopButtonbar } from "./top-buttonbar";
import { CellList } from "./cell-list";
import { Kernel, Mode } from "./status";
import { About } from "./about";
import { NBConvert } from "./nbconvert";
import { InsertImage } from "./insert-image";
import { EditAttachments } from "./edit-attachments";
import { EditCellMetadata } from "./edit-cell-metadata";
import { FindAndReplace } from "./find-and-replace";
import { ConfirmDialog } from "./confirm-dialog";
import { KernelSelector } from "./select-kernel";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { JSONView } from "./json-view";
import { RawEditor } from "./raw-editor";
// import { SnippetsDialog } from "smc-webapp/assistant/dialog";
const { SnippetsDialog } = require("smc-webapp/assistant/dialog");
import { Kernel as KernelType, Kernels as KernelsType } from "./util";
import { Scroll } from "./types";

const KERNEL_STYLE: React.CSSProperties = {
  float: "right",
  paddingLeft: "5px",
  backgroundColor: "#eee",
  display: "block",
  overflow: "hidden",
  borderLeft: "1px solid rgb(231,231,231)",
  borderBottom: "1px solid rgb(231,231,231)",
  whiteSpace: "nowrap"
};

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";
import { JupyterEditorActions } from "../frame-editors/jupyter-editor/actions";

interface JupyterEditorProps {
  // PROPS
  error?: string;
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  editor_actions: JupyterEditorActions;
  name: string; // name of the redux store

  // Comes explicitly from frontend Jupyter state stored in
  // the frame tree, hence it can be different between
  // each view of the notebook, and survives closing and
  // opening the file (or refreshing browser), which is nice!
  is_focused?: boolean;
  is_fullscreen?: boolean; // this means fullscreened frame inside the editor!
  mode: "edit" | "escape"; // oneOf(['edit', 'escape']).isRequired;
  font_size?: number;

  cur_id?: string;
  sel_ids?: immutable.Set<any>; // set of selected cells
  md_edit_ids?: immutable.Set<any>; // ids of markdown cells in edit mode

  scroll?: Scroll; // Causes a scroll when it *changes*
  scrollTop?: number;
  hook_offset?: number;
  view_mode?: "normal" | "json" | "raw";

  // TODO
  complete?: immutable.Map<any, any>; // status of tab completion
  more_output?: immutable.Map<any, any>;
  find_and_replace?: boolean;
  show_kernel_selector?: boolean;

  // REDUX PROPS
  kernel?: string; // string name of the kernel
  kernels?: KernelsType;
  cm_options?: immutable.Map<any, any>; // settings for all the codemirror editors
  site_name?: string;
  // error?: string; // TODO: repeated?
  fatal?: string; // *FATAL* error; user must edit file to fix.
  toolbar?: boolean;
  has_unsaved_changes?: boolean;
  cell_list?: immutable.List<any>; // list of ids of cells in order
  cells?: immutable.Map<any, any>; // map from ids to cells
  project_id?: string;
  directory?: string;
  version?: any;
  about?: boolean;
  backend_kernel_info?: immutable.Map<any, any>;
  confirm_dialog?: immutable.Map<any, any>;
  keyboard_shortcuts?: immutable.Map<any, any>;
  nbconvert?: immutable.Map<any, any>; // backend convert state
  nbconvert_dialog?: immutable.Map<any, any>; // frontend modal dialog state
  path?: string;
  cell_toolbar?: string;
  insert_image?: string; // show insert image dialog
  edit_attachments?: string;
  edit_cell_metadata?: immutable.Map<any, any>;
  editor_settings?: immutable.Map<any, any>;
  raw_ipynb?: immutable.Map<any, any>;
  metadata?: immutable.Map<any, any>;
  trust?: boolean;
  kernel_info?: immutable.Map<any, any>;
  check_select_kernel_init?: boolean;
  kernel_selection?: immutable.Map<string, any>;
  kernels_by_name?: immutable.OrderedMap<string, immutable.Map<string, string>>;
  kernels_by_language?: immutable.OrderedMap<string, immutable.List<string>>;
  default_kernel?: string;
  closestKernel?: KernelType;
}

class JupyterEditor0 extends Component<JupyterEditorProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        kernel: rtypes.string, // string name of the kernel
        kernels: rtypes.immutable.List,
        error: rtypes.string,
        fatal: rtypes.string, // *FATAL* error; user must edit file to fix.
        toolbar: rtypes.bool,
        has_unsaved_changes: rtypes.bool,
        cell_list: rtypes.immutable.List, // list of ids of cells in order
        cells: rtypes.immutable.Map, // map from ids to cells
        cm_options: rtypes.immutable.Map, // settings for all the codemirror editors
        project_id: rtypes.string,
        directory: rtypes.string,
        version: rtypes.object,
        complete: rtypes.immutable.Map, // status of tab completion
        more_output: rtypes.immutable.Map,
        about: rtypes.bool,
        backend_kernel_info: rtypes.immutable.Map,
        confirm_dialog: rtypes.immutable.Map,
        find_and_replace: rtypes.bool,
        keyboard_shortcuts: rtypes.immutable.Map,
        nbconvert: rtypes.immutable.Map, // backend convert state
        nbconvert_dialog: rtypes.immutable.Map, // frontend modal dialog state
        path: rtypes.string,
        cell_toolbar: rtypes.string,
        insert_image: rtypes.string, // show insert image dialog
        edit_attachments: rtypes.string,
        edit_cell_metadata: rtypes.immutable.Map,
        raw_ipynb: rtypes.immutable.Map,
        metadata: rtypes.immutable.Map,
        trust: rtypes.bool,
        kernel_info: rtypes.immutable.Map,
        check_select_kernel_init: rtypes.bool,
        show_kernel_selector: rtypes.bool,
        kernel_selection: rtypes.immutable.Map,
        kernels_by_name: rtypes.immutable.Map,
        kernels_by_language: rtypes.immutable.Map,
        default_kernel: rtypes.string,
        closestKernel: rtypes.immutable.Map
      },
      customize: { site_name: rtypes.string },
      account: { editor_settings: rtypes.immutable.Map }
    };
  }

  render_error() {
    if (this.props.error) {
      const style = {
        margin: "1ex",
        whiteSpace: "pre" as "pre",
        fontSize: "12px",
        fontFamily: "monospace" as "monospace"
      };
      return (
        <ErrorDisplay
          error={this.props.error}
          style={style}
          onClose={() => this.props.actions.set_error(undefined)}
        />
      );
    }
  }

  render_fatal() {
    if (this.props.fatal) {
      return (
        <div>
          <h2 style={{ marginLeft: "10px" }}>Fatal Error loading ipynb file</h2>

          <ErrorDisplay error={this.props.fatal} style={{ margin: "1ex" }} />
        </div>
      );
    }
  }

  render_kernel() {
    return (
      <span style={KERNEL_STYLE}>
        <Kernel
          is_fullscreen={this.props.is_fullscreen}
          name={this.props.name}
          actions={this.props.actions}
        />
        <Mode name={this.props.name} />
      </span>
    );
  }

  render_menubar() {
    if (
      this.props.actions == null ||
      this.props.frame_actions == null ||
      this.props.cells == null ||
      this.props.sel_ids == null ||
      this.props.cur_id == null
    ) {
      return;
    } else {
      return (
        <TopMenubar
          actions={this.props.actions}
          name={this.props.name}
          frame_actions={this.props.frame_actions}
          cells={this.props.cells}
          cur_id={this.props.cur_id}
          view_mode={this.props.view_mode}
        />
      );
    }
  }

  render_buttonbar() {
    if (
      this.props.actions == null ||
      this.props.frame_actions == null ||
      this.props.cells == null ||
      this.props.sel_ids == null ||
      this.props.cur_id == null
    ) {
      return;
    } else {
      return (
        <TopButtonbar
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          name={this.props.name}
          cells={this.props.cells}
          cur_id={this.props.cur_id}
          sel_ids={this.props.sel_ids}
          cell_toolbar={this.props.cell_toolbar}
        />
      );
    }
  }

  render_heading() {
    //if (!this.props.is_focused) return;
    return (
      <div style={{ border: "1px solid rgb(231, 231, 231)" }}>
        {this.render_kernel()}
        {this.render_menubar()}
        {this.props.toolbar ? this.render_buttonbar() : undefined}
      </div>
    );
  }

  render_loading(): Rendered {
    return (
      <Loading
        style={{
          fontSize: "24pt",
          textAlign: "center",
          marginTop: "15px",
          color: "#888"
        }}
      />
    );
  }

  render_cells() {
    if (
      this.props.cell_list == null ||
      this.props.font_size == null ||
      this.props.cm_options == null ||
      this.props.kernels == null ||
      this.props.cells == null
    ) {
      return (
        <Loading
          style={{
            fontSize: "24pt",
            textAlign: "center",
            marginTop: "15px",
            color: "#888"
          }}
        />
      );
    }

    return (
      <CellList
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        name={this.props.name}
        cell_list={this.props.cell_list}
        cells={this.props.cells}
        font_size={this.props.font_size}
        sel_ids={this.props.sel_ids}
        md_edit_ids={this.props.md_edit_ids}
        cur_id={this.props.cur_id}
        mode={this.props.mode}
        hook_offset={this.props.hook_offset}
        cm_options={this.props.cm_options}
        project_id={this.props.project_id}
        directory={this.props.directory}
        scrollTop={this.props.scrollTop}
        complete={this.props.is_focused ? this.props.complete : undefined}
        is_focused={this.props.is_focused}
        more_output={this.props.more_output}
        scroll={this.props.scroll}
        cell_toolbar={this.props.cell_toolbar}
        trust={this.props.trust}
        use_windowed_list={
          this.props.frame_actions != null &&
          this.props.editor_settings != null &&
          !this.props.editor_settings.get("disable_jupyter_windowing")
        }
      />
    );
  }

  render_about() {
    return (
      <About
        actions={this.props.actions}
        about={this.props.about}
        backend_kernel_info={this.props.backend_kernel_info}
      />
    );
  }

  render_nbconvert() {
    if (this.props.path == null || this.props.project_id == null) return;
    return (
      <NBConvert
        actions={this.props.actions}
        path={this.props.path}
        project_id={this.props.project_id}
        nbconvert={this.props.nbconvert}
        nbconvert_dialog={this.props.nbconvert_dialog}
        backend_kernel_info={this.props.backend_kernel_info}
      />
    );
  }

  render_insert_image() {
    if (this.props.insert_image == null || this.props.project_id == null) {
      return;
    }
    return (
      <InsertImage
        actions={this.props.actions}
        project_id={this.props.project_id}
        insert_image={this.props.insert_image}
      />
    );
  }

  render_edit_attachments() {
    if (this.props.edit_attachments == null || this.props.cells == null) {
      return;
    }
    const cell = this.props.cells.get(this.props.edit_attachments);
    if (cell == null) {
      return;
    }
    return <EditAttachments actions={this.props.actions} cell={cell} />;
  }

  render_edit_cell_metadata() {
    if (this.props.edit_cell_metadata == null) {
      return;
    }
    return (
      <EditCellMetadata
        actions={this.props.actions}
        id={this.props.edit_cell_metadata.get("id")}
        metadata={this.props.edit_cell_metadata.get("metadata")}
        font_size={this.props.font_size}
        cm_options={
          this.props.cm_options != null
            ? this.props.cm_options.get("options")
            : undefined
        }
      />
    );
  }

  render_find_and_replace() {
    if (this.props.cells == null || this.props.cur_id == null) {
      return;
    }
    return (
      <FindAndReplace
        actions={this.props.actions}
        find_and_replace={this.props.find_and_replace}
        sel_ids={this.props.sel_ids}
        cur_id={this.props.cur_id}
        cells={this.props.cells}
        cell_list={this.props.cell_list}
      />
    );
  }

  render_confirm_dialog() {
    if (this.props.confirm_dialog == null || this.props.actions == null) return;
    return (
      <ConfirmDialog
        actions={this.props.actions}
        confirm_dialog={this.props.confirm_dialog}
      />
    );
  }

  render_select_kernel() {
    if (this.props.editor_settings == null || this.props.site_name == null)
      return;

    const ask_jupyter_kernel = this.props.editor_settings.get(
      "ask_jupyter_kernel"
    );
    return (
      <KernelSelector
        actions={this.props.actions}
        kernel={this.props.kernel}
        kernel_info={this.props.kernel_info}
        kernel_selection={this.props.kernel_selection}
        kernels_by_name={this.props.kernels_by_name}
        kernels_by_language={this.props.kernels_by_language}
        default_kernel={this.props.default_kernel}
        closestKernel={this.props.closestKernel}
        site_name={this.props.site_name}
        ask_jupyter_kernel={
          ask_jupyter_kernel == null ? true : ask_jupyter_kernel
        }
      />
    );
  }

  render_keyboard_shortcuts() {
    if (this.props.actions == null || this.props.frame_actions == null) return;
    return (
      <KeyboardShortcuts
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        editor_actions={this.props.editor_actions}
        keyboard_shortcuts={this.props.keyboard_shortcuts}
      />
    );
  }

  render_snippets_dialog() {
    return (
      <SnippetsDialog
        name={this.props.actions.snippet_actions.name}
        actions={this.props.actions.snippet_actions}
      />
    );
  }

  render_json_viewer() {
    if (this.props.cells == null) return <Loading />;
    return (
      <JSONView
        actions={this.props.actions}
        cells={this.props.cells}
        font_size={this.props.font_size}
      />
    );
  }

  render_raw_editor() {
    if (
      this.props.raw_ipynb == null ||
      this.props.cm_options == null ||
      this.props.font_size == null
    ) {
      return <Loading />;
    }
    return (
      <RawEditor
        actions={this.props.actions}
        font_size={this.props.font_size}
        raw_ipynb={this.props.raw_ipynb}
        cm_options={this.props.cm_options.get("options")}
      />
    );
  }

  render_main_view() {
    switch (this.props.view_mode) {
      case "json":
        return this.render_json_viewer();
      case "raw":
        return this.render_raw_editor();
      case "normal":
        return this.render_cells();
      default:
        return this.render_cells();
    }
  }

  render_main() {
    if (!this.props.check_select_kernel_init) {
      return this.render_loading();
    } else if (this.props.show_kernel_selector) {
      return this.render_select_kernel();
    } else {
      return this.render_main_view();
    }
  }

  render_modals() {
    if (!this.props.is_focused) return;
    return (
      <>
        {this.render_about()}
        {this.render_nbconvert()}
        {this.render_insert_image()}
        {this.render_edit_attachments()}
        {this.render_edit_cell_metadata()}
        {this.render_find_and_replace()}
        {this.render_keyboard_shortcuts()}
        {this.render_snippets_dialog()}
        {this.render_confirm_dialog()}
      </>
    );
  }

  render() {
    if (this.props.fatal) {
      return this.render_fatal();
    }
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "hidden"
        }}
      >
        {this.render_error()}
        {this.render_modals()}
        {this.render_heading()}
        {this.render_main()}
      </div>
    );
  }
}

export const JupyterEditor = rclass(JupyterEditor0);
