/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Time travel editor react component.

import { Checkbox, Tooltip } from "antd";
import { Map } from "immutable";
import { redux } from "../../app-framework";
import { Loading } from "../../components";
import { TimeTravelActions, TimeTravelState } from "./actions";
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
import { to_ipynb } from "../../jupyter/history-viewer";
import { SagewsDiff } from "./sagews-diff";
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import { Viewer } from "./viewer";

const HAS_SPECIAL_VIEWER = new Set([
  "tasks",
  "ipynb",
  "sagews",
  "board",
  "slides",
  "md",
]);

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
}

export function TimeTravel(props: Props) {
  const { project_id, path } = props;
  const useEditor = useEditorRedux<TimeTravelState>({ project_id, path });
  const versions = useEditor("versions");
  const hasFullHistory = useEditor("has_full_history");
  const loading = useEditor("loading");
  const docpath = useEditor("docpath");
  const docext = useEditor("docext");
  const git = useEditor("git");

  const getVersion = (): Date | undefined => {
    if (props.desc == null || versions == null) return;
    const version = props.desc.get("version");
    const d: Date | undefined = versions.get(version);
    if (d != null) return d;
    return versions.get(-1);
  };

  const renderVersion = () => {
    if (props.desc == null || versions == null) return;
    if (props.desc.get("changes_mode")) {
      const version0 = props.desc.get("version0");
      const version1 = props.desc.get("version1");
      return (
        <VersionRange
          version0={version0}
          version1={version1}
          max={versions.size}
        />
      );
    } else {
      const date = getVersion();
      const version = props.desc.get("version");
      if (date == null || version == null) return;
      return <Version date={date} number={version + 1} max={versions.size} />;
    }
  };

  const getDoc = (version?: number | Date | undefined) => {
    if (version == null) {
      version = getVersion();
    } else if (typeof version == "number") {
      if (versions == null) return;
      version = versions.get(version);
    }
    if (version == null) return;
    return props.actions.get_doc(version);
  };

  const renderDocument = () => {
    if (
      docpath == null ||
      docext == null ||
      props.desc == null ||
      props.desc.get("changes_mode")
    ) {
      return;
    }

    const version = getVersion();
    if (version == null) {
      // no versions yet, so nothing to render
      return;
    }
    const doc = getDoc(version);
    if (doc == null) {
      return;
    }
    return (
      <Viewer
        ext={docext}
        doc={doc}
        textMode={props.desc.get("text_mode")}
        actions={props.actions}
        id={props.id}
        path={docpath ? docpath : "a.js"}
        project_id={props.project_id}
        font_size={props.font_size}
        editor_settings={props.editor_settings}
      />
    );
  };

  const getDiffValues = ():
    | { v0: string; v1: string; use_json: boolean }
    | undefined => {
    if (
      docpath == null ||
      props.desc == null ||
      versions == null ||
      !props.desc.get("changes_mode")
    ) {
      return;
    }
    if (docext == "ipynb") {
      const syncdb = props.actions.syncdoc;
      if (syncdb == null) return;
      const d0 = versions.get(props.desc.get("version0"));
      if (d0 == null) return;
      const d1 = versions.get(props.desc.get("version1"));
      if (d1 == null) return;
      const v0 = json_stable(to_ipynb(syncdb.version(d0)), { space: 1 });
      const v1 = json_stable(to_ipynb(syncdb.version(d1)), { space: 1 });
      return { v0, v1, use_json: true };
    }

    const doc0 = getDoc(props.desc.get("version0"));
    if (doc0 == null) return; // something is wrong
    const v0 = doc0.to_str();
    const use_json = doc0["value"] == null;

    const doc1 = getDoc(props.desc.get("version1"));
    if (doc1 == null) return; // something is wrong
    const v1 = doc1.to_str();

    return { v0, v1, use_json };
  };

  const renderDiff = () => {
    if (
      docpath == null ||
      props.desc == null ||
      props.desc.get("changes_mode") != true
    ) {
      return;
    }

    const x = getDiffValues();
    if (x == null) {
      return renderLoading();
    }
    const { v0, v1, use_json } = x;

    if (docext == "sagews") {
      return (
        <SagewsDiff
          v0={v0}
          v1={v1}
          path={docpath}
          project_id={props.project_id}
          font_size={props.font_size}
          editor_settings={props.editor_settings}
        />
      );
    }

    return (
      <Diff
        v0={v0}
        v1={v1}
        path={docpath}
        font_size={props.font_size}
        editor_settings={props.editor_settings}
        use_json={use_json}
      />
    );
  };

  const renderNavigationButtons = () => {
    if (props.desc == null || versions == null) {
      return;
    }
    let version0: number, version1: number;
    if (props.desc.get("changes_mode")) {
      version0 = props.desc.get("version0");
      version1 = props.desc.get("version1");
    } else {
      version0 = version1 = props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <NavigationButtons
        id={props.id}
        actions={props.actions}
        version0={version0}
        version1={version1}
        max={versions.size - 1}
      />
    );
  };

  const renderNavigationSlider = () => {
    if (
      props.desc == null ||
      versions == null ||
      props.desc.get("changes_mode")
    )
      return;
    return (
      <NavigationSlider
        id={props.id}
        actions={props.actions}
        version={props.desc.get("version")}
        max={versions.size - 1}
        versions={versions}
      />
    );
  };

  const renderRangeSlider = () => {
    if (
      props.desc == null ||
      versions == null ||
      !props.desc.get("changes_mode")
    )
      return;
    return (
      <RangeSlider
        id={props.id}
        actions={props.actions}
        max={versions.size - 1}
        versions={versions}
        version0={props.desc.get("version0")}
        version1={props.desc.get("version1")}
      />
    );
  };

  const renderAuthor = () => {
    const version = getVersion();
    if (version == null) return;
    if (props.desc == null) return;
    let version0: number, version1: number;
    if (props.desc.get("changes_mode")) {
      version0 = props.desc.get("version0");
      version1 = props.desc.get("version1");
    } else {
      version0 = version1 = props.desc.get("version");
    }
    if (version0 == null || version1 == null) return;
    return (
      <Authors
        actions={props.actions}
        version0={version0}
        version1={version1}
      />
    );
  };

  const renderLoadFullHistory = () => {
    if (hasFullHistory) return;
    return <LoadFullHistory actions={props.actions} />;
  };

  const renderOpenFile = () => {
    if (props.is_subframe) return;
    return <OpenFile actions={props.actions} />;
  };

  const renderOpenSnapshots = () => {
    if (props.is_subframe) return;
    return <OpenSnapshots actions={props.actions} />;
  };

  const renderRevertFile = () => {
    if (props.desc == null || props.desc.get("changes_mode")) return;
    return <RevertFile actions={props.actions} version={getVersion()} />;
  };

  const renderChangesMode = () => {
    if (versions == null) return;
    return (
      <ChangesMode
        id={props.id}
        actions={props.actions}
        disabled={versions.size <= 1}
        changes_mode={props.desc?.get("changes_mode", false)}
      />
    );
  };

  const renderExport = () => {
    if (redux.getStore("page").get("fullscreen") == "kiosk") {
      // doesn't make sense in kiosk mode.
      return;
    }
    return <Export actions={props.actions} />;
  };

  const renderControls = () => {
    return (
      <div
        style={{
          background: props.is_current ? "#fafafa" : "#ddd",
          borderBottom: "1px solid #ccc",
          padding: "5px",
        }}
      >
        {renderChangesMode()}
        {!props.desc?.get("changes_mode", false) &&
          HAS_SPECIAL_VIEWER.has(docext ?? "") && (
            <Tooltip title="Display underlying file as text">
              <Checkbox
                defaultChecked={!!props.desc.get("text_mode")}
                onChange={(e) =>
                  props.actions.setTextMode(props.id, e.target.checked)
                }
              >
                Text
              </Checkbox>
            </Tooltip>
          )}
        {git && (
          <Tooltip title="Show Git history instead of CoCalc edit history">
            <Checkbox
              defaultChecked={!!props.desc.get("git_mode")}
              onChange={(e) =>
                props.actions.setGitMode(props.id, e.target.checked)
              }
            >
              Git
            </Checkbox>
          </Tooltip>
        )}
        {renderNavigationButtons()}
        <div style={{ display: "inline-flex", margin: "0 5px" }}>
          {renderLoadFullHistory()}
          {renderOpenFile()}
          {renderRevertFile()}
          {renderOpenSnapshots()}
          {renderExport()}
        </div>
        {renderVersion()}
        {", "}
        {renderAuthor()}
      </div>
    );
  };

  const renderTimeSelect = () => {
    return (
      <>
        {renderNavigationSlider()}
        {renderRangeSlider()}
      </>
    );
  };

  const renderLoading = () => {
    return <Loading theme={"medium"} />;
  };

  const renderView = () => {
    return (
      <>
        {renderDocument()}
        {renderDiff()}
      </>
    );
  };

  if (loading) {
    return renderLoading();
  }
  return (
    <div className="smc-vfill">
      {renderControls()}
      {renderTimeSelect()}
      {renderView()}
    </div>
  );
}
