/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component, which ties everything together
*/

import { Button, Tooltip } from "antd";
import * as immutable from "immutable";
import { useEffect } from "react";

import {
  CSS,
  React,
  redux,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useRef } from "react";

// Support for all the MIME types
import "./output-messages/mime-types/init-frontend";

// React components that implement parts of the Jupyter notebook.
import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { ErrorDisplay, Icon, Text } from "@cocalc/frontend/components";
import { A } from "@cocalc/frontend/components/A";
import { Loading } from "@cocalc/frontend/components/loading";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import { LLMTools, NotebookMode, Scroll } from "@cocalc/jupyter/types";
import { Kernels as KernelsType } from "@cocalc/jupyter/util/misc";
import { syncdbPath } from "@cocalc/util/jupyter/names";
import { COLORS } from "@cocalc/util/theme";
import { JupyterEditorActions } from "../frame-editors/jupyter-editor/actions";
import { About } from "./about";
import type { JupyterActions } from "./browser-actions";
import { CellList } from "./cell-list";
import { ConfirmDialog } from "./confirm-dialog";
import { EditAttachments } from "./edit-attachments";
import { EditCellMetadata } from "./edit-cell-metadata";
import { FindAndReplace } from "./find-and-replace";
import JupyterClassic from "./jupyter-classic";
import { JupyterContext } from "./jupyter-context";
import useKernelUsage from "./kernel-usage";
import KernelWarning from "./kernel-warning";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import * as toolComponents from "./llm";
import { NBConvert } from "./nbconvert";
import { KernelSelector } from "./select-kernel";
import { Kernel } from "./status";

export const ERROR_STYLE: CSS = {
  maxHeight: "30vh",
  overflow: "auto",
} as const;

interface Props {
  error?: string;
  actions: JupyterActions;
  editor_actions: JupyterEditorActions;
  name: string; // name of the redux store

  // Comes explicitly from frontend Jupyter state stored in
  // the frame tree, hence it can be different between
  // each view of the notebook, and survives closing and
  // opening the file (or refreshing browser), which is nice!
  is_focused?: boolean;
  is_fullscreen?: boolean; // this means fullscreened frame inside the editor!
  is_visible?: boolean;
  mode: NotebookMode;
  font_size?: number;

  cur_id?: string;
  sel_ids?: immutable.Set<any>; // set of selected cells
  md_edit_ids?: immutable.Set<any>; // ids of markdown cells in edit mode

  scroll?: Scroll; // how to scroll when scroll_seq changes
  scroll_seq?: number; //

  scrollTop?: number;
  hook_offset?: number;
}

export const JupyterEditor: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions,
    editor_actions,
    name,
    is_focused,
    is_fullscreen,
    is_visible,
    font_size,
    mode,
    cur_id,
    sel_ids,
    md_edit_ids,
    scroll,
    scroll_seq,
    scrollTop,
    hook_offset,
  } = props;
  // status of tab completion
  const complete: undefined | immutable.Map<any, any> = useRedux([
    name,
    "complete",
  ]);
  const more_output: undefined | immutable.Map<any, any> = useRedux([
    name,
    "more_output",
  ]);
  const find_and_replace: undefined | boolean = useRedux([
    name,
    "find_and_replace",
  ]);
  const show_kernel_selector: undefined | boolean = useRedux([
    name,
    "show_kernel_selector",
  ]);
  // string name of the kernel
  const kernelspec = useRedux([name, "kernel_info"]);
  const error: undefined | KernelsType = useRedux([name, "error"]);
  // settings for all the codemirror editors
  const cm_options: undefined | immutable.Map<any, any> = useRedux([
    name,
    "cm_options",
  ]);
  // *FATAL* error; user must edit file to fix.
  const fatal: undefined | string = useRedux([name, "fatal"]);
  // const has_unsaved_changes: undefined | boolean = useRedux([
  //   name,
  //   "has_unsaved_changes",
  // ]);
  // list of ids of cells in order
  const cell_list: undefined | immutable.List<string> = useRedux([
    name,
    "cell_list",
  ]);

  // if there is a stdin request:
  const stdin = useRedux([name, "stdin"]);

  // map from ids to cells
  const cells: undefined | immutable.Map<string, any> = useRedux([
    name,
    "cells",
  ]);
  const project_id: string = useRedux([name, "project_id"]);
  const directory: undefined | string = useRedux([name, "directory"]);
  // const version: undefined | any = useRedux([name, "version"]);
  const about: undefined | boolean = useRedux([name, "about"]);
  const read_only = useRedux([name, "read_only"]);
  const backend_kernel_info: undefined | immutable.Map<any, any> = useRedux([
    name,
    "backend_kernel_info",
  ]);
  const confirm_dialog: undefined | immutable.Map<any, any> = useRedux([
    name,
    "confirm_dialog",
  ]);
  const keyboard_shortcuts: undefined | immutable.Map<any, any> = useRedux([
    name,
    "keyboard_shortcuts",
  ]);
  // backend convert state
  const nbconvert: undefined | immutable.Map<any, any> = useRedux([
    name,
    "nbconvert",
  ]);
  // frontend modal dialog state
  const nbconvert_dialog: undefined | immutable.Map<any, any> = useRedux([
    name,
    "nbconvert_dialog",
  ]);
  const path: undefined | string = useRedux([name, "path"]);
  const cell_toolbar: undefined | string = useRedux([name, "cell_toolbar"]);
  const edit_attachments: undefined | string = useRedux([
    name,
    "edit_attachments",
  ]);
  const edit_cell_metadata: undefined | immutable.Map<any, any> = useRedux([
    name,
    "edit_cell_metadata",
  ]);
  const trust: undefined | boolean = useRedux([name, "trust"]);
  const check_select_kernel_init: undefined | boolean = useRedux([
    name,
    "check_select_kernel_init",
  ]);
  const pendingCells: undefined | immutable.Set<string> = useRedux([
    name,
    "pendingCells",
  ]);

  const computeServerId = path
    ? useTypedRedux({ project_id }, "compute_server_ids")?.get(syncdbPath(path))
    : undefined;

  useEffect(() => {
    actions.fetch_jupyter_kernels();
  }, [computeServerId]);

  // this is confusing: it's here because the "nbviewer" code reuses a subset of components
  // and this is here to pass down AI tools related functionality to those, which are used by the frontend
  const [model, setModel] = useLanguageModelSetting(project_id);
  // ATTN: if you add values here, make sure to check the memoize check functions in the components –
  // otherwise they will not re-render as expected.
  const llmEnabled = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id);
  // This only checks if we can use the LLM tools at all – detailed checks like "for this project in a course" are by component
  const llmTools: LLMTools | undefined = llmEnabled
    ? {
        model,
        setModel,
        toolComponents,
      }
    : undefined;

  // We use react-virtuoso, which is an amazing library for
  // doing windowing on dynamically sized content... like
  // what comes up with Jupyter notebooks.
  // We do have to ensure that this can be easily disabled
  // by users, due to situations like this
  //   https://github.com/sagemathinc/cocalc/issues/4727
  // e.g., where maybe they want to use Javascript across all
  // cells, or they want to preserve state in iframes, which
  // requires keeping things rendered.
  // NOTE: we get this once from the account store and do NOT
  // load it again, since we didn't implement switching between
  // rendering modes on the fly and such a switch will crash for sure.
  const useWindowedListRef = useRef<boolean>(
    !redux
      .getStore("account")
      .getIn(["editor_settings", "disable_jupyter_virtualization"]),
  );

  const { usage, expected_cell_runtime } = useKernelUsage(name);

  const jupyterClassic = useRedux([
    "account",
    "editor_settings",
    "jupyter_classic",
  ]);

  function render_error() {
    if (error) {
      return (
        <ErrorDisplay
          banner={true}
          error={error}
          style={ERROR_STYLE}
          onClose={() => actions.set_error(undefined)}
        />
      );
    }
  }

  function render_fatal() {
    return (
      <div>
        <h2 style={{ marginLeft: "10px" }}>Fatal Error loading ipynb file</h2>
        <ErrorDisplay error={fatal} style={{ margin: "1ex" }} />
      </div>
    );
  }

  function render_cells() {
    if (
      cell_list == null ||
      font_size == null ||
      cm_options == null ||
      cells == null
    ) {
      return (
        <Loading
          style={{
            fontSize: "24pt",
            textAlign: "center",
            marginTop: "15px",
            color: "#888",
          }}
        />
      );
    }

    return (
      <CellList
        actions={actions}
        read_only={read_only}
        cell_list={cell_list}
        stdin={stdin}
        cell_toolbar={cell_toolbar}
        cells={cells}
        cm_options={cm_options}
        complete={is_focused ? complete : undefined}
        cur_id={cur_id}
        directory={directory}
        font_size={font_size}
        hook_offset={hook_offset}
        is_focused={is_focused}
        is_visible={is_visible}
        md_edit_ids={md_edit_ids}
        mode={mode}
        more_output={more_output}
        name={name}
        project_id={project_id}
        scroll={scroll}
        scroll_seq={scroll_seq}
        scrollTop={scrollTop}
        sel_ids={sel_ids}
        trust={trust}
        use_windowed_list={useWindowedListRef.current}
        llmTools={llmTools}
        computeServerId={computeServerId}
        pendingCells={pendingCells}
      />
    );
  }

  function render_select_kernel() {
    return <KernelSelector actions={actions} />;
  }

  function render_main() {
    if (!check_select_kernel_init) {
      <Loading
        style={{
          fontSize: "24pt",
          textAlign: "center",
          marginTop: "15px",
          color: COLORS.GRAY,
        }}
      />;
    } else if (show_kernel_selector) {
      return render_select_kernel();
    } else {
      return render_cells();
    }
  }

  function render_modals() {
    if (!is_focused) return;
    return (
      <>
        <About
          actions={actions}
          about={about}
          backend_kernel_info={backend_kernel_info}
        />
        {path != null && project_id != null && (
          <NBConvert
            actions={actions}
            path={path}
            project_id={project_id}
            nbconvert={nbconvert}
            nbconvert_dialog={nbconvert_dialog}
            backend_kernel_info={backend_kernel_info}
          />
        )}
        {edit_attachments != null && (
          <EditAttachments
            actions={actions}
            cell={cells?.get(edit_attachments)}
          />
        )}
        {edit_cell_metadata != null && (
          <EditCellMetadata
            actions={actions}
            id={edit_cell_metadata.get("id")}
            metadata={edit_cell_metadata.get("metadata")}
            font_size={font_size}
            cm_options={
              cm_options != null ? cm_options.get("options") : undefined
            }
          />
        )}
        {cells != null && cur_id != null && (
          <FindAndReplace
            actions={actions}
            find_and_replace={find_and_replace}
            sel_ids={sel_ids}
            cur_id={cur_id}
            cells={cells}
            cell_list={cell_list}
          />
        )}
        {actions != null && (
          <KeyboardShortcuts
            actions={actions}
            editor_actions={editor_actions}
            keyboard_shortcuts={keyboard_shortcuts}
          />
        )}
        {actions != null && confirm_dialog != null && (
          <ConfirmDialog actions={actions} confirm_dialog={confirm_dialog} />
        )}
      </>
    );
  }

  if (jupyterClassic) {
    return <JupyterClassic project_id={project_id} />;
  }

  if (fatal) {
    return render_fatal();
  }

  return (
    <JupyterContext.Provider value={{ kernelspec: kernelspec?.toJS(), trust }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflowY: "hidden",
        }}
      >
        <ComputeServerDocStatus
          id={computeServerId ?? 0}
          project_id={project_id}
        />
        {!read_only && <KernelWarning name={name} actions={actions} />}
        {render_error()}
        {render_modals()}
        {!read_only && (
          <Kernel
            is_fullscreen={is_fullscreen}
            actions={actions}
            usage={usage}
            expected_cell_runtime={expected_cell_runtime}
            computeServerId={computeServerId}
          />
        )}
        {cell_toolbar === "create_assignment" && (
          <div
            style={{
              paddingLeft: "30px",
              marginBottom: "5px",
              borderBottom: "1px solid #ddd",
            }}
          >
            <Text strong>nbgrader:</Text>{" "}
            <A href="https://doc.cocalc.com/teaching-nbgrader.html">
              <Icon name="book" /> Docs
            </A>
            <Tooltip title="Generate the student version of this document, which strips out the extra instructor tests and cells.">
              <Button
                style={{ margin: "5px 15px" }}
                onClick={() => {
                  props.actions.nbgrader_actions.confirm_assign();
                }}
              >
                Create Student Version...
              </Button>
            </Tooltip>
            <Button
              onClick={() => {
                props.actions.cell_toolbar();
              }}
            >
              Close
            </Button>
          </div>
        )}
        {render_main()}
      </div>
    </JupyterContext.Provider>
  );
});
