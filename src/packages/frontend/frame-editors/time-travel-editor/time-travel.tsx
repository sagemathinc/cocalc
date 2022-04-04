/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Time travel editor react component.

import { Checkbox, Tooltip } from "antd";
import { List, Map } from "immutable";
import { ButtonGroup } from "react-bootstrap";

import { Component, Rendered, rclass, rtypes } from "../../app-framework";
import { Loading } from "../../components";

import { TimeTravelActions } from "./actions";
import { Document } from "./document";
import { Diff } from "./diff";
import { NavigationButtons } from "./navigation-buttons";
import { NavigationSlider } from "./navigation-slider";
import { RangeSlider } from "./range-slider";
import { Version, VersionRange } from "./version";
import { Authors } from "./authors";
import { LoadFullHistory } from "./load-full-history";
import { OpenFile } from "./open-file";
import { RevertFile } from "./revert-file";
import { ChangesMode } from "./changes-mode";
import { OpenSnapshots } from "./open-snapshots";
import { Export } from "./export";
import json_stable from "json-stable-stringify";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { TasksHistoryViewer } from "../../editors/task-editor/history-viewer";
import {
  HistoryViewer as JupyterHistoryViewer,
  to_ipynb,
} from "../../jupyter/history-viewer";
import { SagewsCodemirror } from "./sagews-codemirror";
import { SagewsDiff } from "./sagews-diff";
import Whiteboard from "@cocalc/frontend/frame-editors/whiteboard-editor/time-travel";

const HAS_SPECIAL_VIEWER = new Set(["tasks", "ipynb", "sagews", "board"]);

interface Props {
  actions: TimeTravelActions;
  id: string;
  path: string;
  project_id: string;
  desc: Map<string, any>;
  font_size: number;
  editor_settings: Map<string, any>;
  resize: number;
  is_current: boolean;
  is_subframe: boolean;

  // reduxProps
  versions?: List<Date>;
  loading?: boolean;
  has_full_history?: boolean;
  docpath?: string;
  docext?: string;
}

class TimeTravel extends Component<Props> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        versions: rtypes.immutable.List,
        loading: rtypes.bool,
        has_full_history: rtypes.bool,
        docpath: rtypes.string,
        docext: rtypes.string,
      },
    };
  }

  private get_version(): Date | undefined {
    if (this.props.desc == null || this.props.versions == null) return;
    const version = this.props.desc.get("version");
    const d: Date | undefined = this.props.versions.get(version);
    if (d != null) return d;
    return this.props.versions.get(-1);
  }

  private render_version(): Rendered {
    if (this.props.desc == null || this.props.versions == null) return;
    if (this.props.desc.get("changes_mode")) {
      const version0 = this.props.desc.get("version0");
      const version1 = this.props.desc.get("version1");
      return (
        <VersionRange
          version0={version0}
          version1={version1}
          max={this.props.versions.size}
        />
      );
    } else {
      const date = this.get_version();
      const version = this.props.desc.get("version");
      if (date == null || version == null) return;
      return (
        <Version
          date={date}
          number={version + 1}
          max={this.props.versions.size}
        />
      );
    }
  }

  private get_doc(version?: number | Date | undefined): any {
    if (version == null) {
      version = this.get_version();
    } else if (typeof version == "number") {
      if (this.props.versions == null) return;
      version = this.props.versions.get(version);
    }
    if (version == null) return;
    return this.props.actions.get_doc(version);
  }

  private render_document(): Rendered {
    if (
      this.props.docpath == null ||
      this.props.docext == null ||
      this.props.desc == null ||
      this.props.desc.get("changes_mode")
    ) {
      return;
    }
    const version = this.get_version();
    if (version == null) return; // no versions yet, so nothing to render
    const syncdoc = this.props.actions.syncdoc;
    if (syncdoc == null) return; // no syncdoc yet so again nothing to render.
    if (this.props.desc.get("text_mode")) {
      return this.render_document_codemirror();
    }
    // if you change this, also change HAS_SPECIAL_VIEWER above!
    switch (this.props.docext) {
      case "tasks":
        return this.render_document_tasks(syncdoc, version);
      case "ipynb":
        return this.render_document_jupyter_notebook(syncdoc, version);
      case "sagews":
        return this.render_document_sagews();
      case "board":
        return (
          <Whiteboard
            syncdb={syncdoc}
            version={version}
            font_size={this.props.font_size}
          />
        );
      default:
        return this.render_document_codemirror();
    }
  }

  private render_document_tasks(syncdoc: SyncDoc, version: Date): Rendered {
    return (
      <TasksHistoryViewer
        font_size={this.props.font_size}
        syncdb={syncdoc}
        version={version}
      />
    );
  }

  private render_document_jupyter_notebook(
    syncdoc: SyncDoc,
    version: Date
  ): Rendered {
    return (
      <JupyterHistoryViewer
        font_size={this.props.font_size}
        syncdb={syncdoc}
        version={version}
      />
    );
  }

  private render_document_sagews(): Rendered {
    if (this.props.docpath == null || this.props.project_id == null) return;
    const doc = this.get_doc();
    if (doc == null) return;
    return (
      <SagewsCodemirror
        content={doc.to_str()}
        path={this.props.docpath}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  private render_document_codemirror(): Rendered {
    if (this.props.docpath == null) return;
    const doc = this.get_doc();
    if (doc == null) return;
    return (
      <Document
        actions={this.props.actions}
        id={this.props.id}
        doc={doc.to_str()}
        path={doc.value == null ? "a.js" : this.props.docpath}
        project_id={this.props.project_id}
        font_size={this.props.font_size}
        editor_settings={this.props.editor_settings}
      />
    );
  }

  private get_diff_values():
    | { v0: string; v1: string; use_json: boolean }
    | undefined {
    if (
      this.props.docpath == null ||
      this.props.desc == null ||
      this.props.versions == null ||
      !this.props.desc.get("changes_mode")
    ) {
      return;
    }
    if (this.props.docext == "ipynb") {
      const syncdb = this.props.actions.syncdoc;
      if (syncdb == null) return;
      const d0 = this.props.versions.get(this.props.desc.get("version0"));
      if (d0 == null) return;
      const d1 = this.props.versions.get(this.props.desc.get("version1"));
      if (d1 == null) return;
      const v0 = json_stable(to_ipynb(syncdb, d0), { space: 1 });
      const v1 = json_stable(to_ipynb(syncdb, d1), { space: 1 });
      return { v0, v1, use_json: true };
    }

    const doc0 = this.get_doc(this.props.desc.get("version0"));
    if (doc0 == null) return; // something is wrong
    const v0 = doc0.to_str();
    const use_json = doc0.value == null;

    const doc1 = this.get_doc(this.props.desc.get("version1"));
    if (doc1 == null) return; // something is wrong
    const v1 = doc1.to_str();

    return { v0, v1, use_json };
  }

  private render_diff(): Rendered {
    if (
      this.props.docpath == null ||
      this.props.desc == null ||
      this.props.desc.get("changes_mode") != true
    )
      return;

    const x = this.get_diff_values();
    if (x == null) return this.render_loading();
    const { v0, v1, use_json } = x;

    if (this.props.docext == "sagews") {
      return (
        <SagewsDiff
          v0={v0}
          v1={v1}
          path={this.props.docpath}
          project_id={this.props.project_id}
          font_size={this.props.font_size}
          editor_settings={this.props.editor_settings}
        />
      );
    }

    return (
      <Diff
        v0={v0}
        v1={v1}
        path={this.props.docpath}
        font_size={this.props.font_size}
        editor_settings={this.props.editor_settings}
        use_json={use_json}
      />
    );
  }

  private render_navigation_buttons(): Rendered {
    if (this.props.desc == null || this.props.versions == null) return;
    let version0: number, version1: number;
    if (this.props.desc.get("changes_mode")) {
      version0 = this.props.desc.get("version0");
      version1 = this.props.desc.get("version1");
    } else {
      version0 = version1 = this.props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <NavigationButtons
        id={this.props.id}
        actions={this.props.actions}
        version0={version0}
        version1={version1}
        max={this.props.versions.size - 1}
      />
    );
  }

  private render_navigation_slider(): Rendered {
    if (
      this.props.desc == null ||
      this.props.versions == null ||
      this.props.desc.get("changes_mode")
    )
      return;
    return (
      <NavigationSlider
        id={this.props.id}
        actions={this.props.actions}
        version={this.props.desc.get("version")}
        max={this.props.versions.size - 1}
      />
    );
  }

  private render_range_slider(): Rendered {
    if (
      this.props.desc == null ||
      this.props.versions == null ||
      !this.props.desc.get("changes_mode")
    )
      return;
    return (
      <RangeSlider
        id={this.props.id}
        actions={this.props.actions}
        max={this.props.versions.size - 1}
        versions={this.props.versions}
        version0={this.props.desc.get("version0")}
        version1={this.props.desc.get("version1")}
      />
    );
  }

  private render_author(): Rendered {
    const version = this.get_version();
    if (version == null) return;
    if (this.props.desc == null) return;
    let version0: number, version1: number;
    if (this.props.desc.get("changes_mode")) {
      version0 = this.props.desc.get("version0");
      version1 = this.props.desc.get("version1");
    } else {
      version0 = version1 = this.props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <Authors
        actions={this.props.actions}
        version0={version0}
        version1={version1}
      />
    );
  }

  private render_load_full_history(): Rendered {
    if (this.props.has_full_history) return;
    return <LoadFullHistory actions={this.props.actions} />;
  }

  private render_open_file(): Rendered {
    if (this.props.is_subframe) return;
    return <OpenFile actions={this.props.actions} />;
  }

  private render_open_snapshots(): Rendered {
    if (this.props.is_subframe) return;
    return <OpenSnapshots actions={this.props.actions} />;
  }

  private render_revert_file(): Rendered {
    if (this.props.desc == null || this.props.desc.get("changes_mode")) return;
    return (
      <RevertFile actions={this.props.actions} version={this.get_version()} />
    );
  }

  private render_changes_mode(): Rendered {
    if (this.props.versions == null) return;
    return (
      <ChangesMode
        id={this.props.id}
        actions={this.props.actions}
        disabled={this.props.versions.size <= 1}
        changes_mode={
          this.props.desc != null && this.props.desc.get("changes_mode", false)
        }
      />
    );
  }

  private render_export(): Rendered {
    return <Export actions={this.props.actions} />;
  }

  private render_controls(): Rendered {
    return (
      <div
        style={{
          background: this.props.is_current ? "#fafafa" : "#ddd",
          borderBottom: "1px solid #ccc",
          marginLeft: "5px",
        }}
      >
        {this.render_changes_mode()}
        {HAS_SPECIAL_VIEWER.has(this.props.docext ?? "") && (
          <Tooltip title="Display underlying file as text">
            <Checkbox
              defaultChecked={!!this.props.desc.get("text_mode")}
              onChange={(e) =>
                this.props.actions.setTextMode(this.props.id, e.target.checked)
              }
            >
              Text
            </Checkbox>
          </Tooltip>
        )}
        {this.render_navigation_buttons()}
        <ButtonGroup style={{ margin: "0 10px" }}>
          {this.render_load_full_history()}
          {this.render_open_file()}
          {this.render_revert_file()}
          {this.render_open_snapshots()}
          {this.render_export()}
        </ButtonGroup>
        {this.render_version()}
        {", "}
        {this.render_author()}
      </div>
    );
  }

  private render_time_select(): Rendered {
    return (
      <>
        {this.render_navigation_slider()}
        {this.render_range_slider()}
      </>
    );
  }

  private render_loading(): Rendered {
    return <Loading theme={"medium"} />;
  }

  private render_view(): Rendered {
    return (
      <>
        {this.render_document()}
        {this.render_diff()}
      </>
    );
  }

  public render(): Rendered {
    if (this.props.loading) {
      return this.render_loading();
    }
    return (
      <div className="smc-vfill">
        {this.render_controls()}
        {this.render_time_select()}
        {this.render_view()}
      </div>
    );
  }
}

const tmp = rclass(TimeTravel);
export { tmp as TimeTravel };
