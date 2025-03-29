/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Time travel editor react component

import { useEffect, useState } from "react";
import { Button, Checkbox, Space, Tooltip } from "antd";
import { Map } from "immutable";
import {
  redux,
  useTypedRedux,
  useAsyncEffect,
  useEditorRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { TimeTravelActions, TimeTravelState } from "./actions";
import { Diff } from "./diff";
import { NavigationButtons } from "./navigation-buttons";
import { NavigationSlider } from "./navigation-slider";
import { RangeSlider } from "./range-slider";
import { Version, VersionRange } from "./version";
import { GitAuthors, TimeTravelAuthors } from "./authors";
import { LoadMoreHistory } from "./load-more-history";
import { OpenFile } from "./open-file";
import { RevertFile } from "./revert-file";
import { ChangesMode } from "./changes-mode";
import { OpenSnapshots } from "./open-snapshots";
import { Export } from "./export";
import json_stable from "json-stable-stringify";
import { to_ipynb } from "../../jupyter/history-viewer";
import { SagewsDiff } from "./sagews-diff";
import { HAS_SPECIAL_VIEWER, Viewer } from "./viewer";
import type { Document } from "@cocalc/sync/editor/generic/types";
import useLicenses from "@cocalc/frontend/site-licenses/use-licenses";
import RequireLicense from "@cocalc/frontend/site-licenses/require-license";
import ShowError from "@cocalc/frontend/components/error";
import { debounce } from "lodash";

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
  const unlicensedLimit = useTypedRedux(
    "customize",
    "unlicensed_project_timetravel_limit",
  );
  const licenses = useLicenses({ project_id });
  const error = useEditor("error");
  const versions = useEditor("versions");
  const startIndex = useEditor("start_index") ?? 0;
  const gitVersions = useEditor("git_versions");
  const hasFullHistory = useEditor("has_full_history");
  const loading = useEditor("loading");
  const docpath = useEditor("docpath");
  const docext = useEditor("docext");
  const git = !!useEditor("git");

  const [doc, setDoc] = useState<Document | undefined>(undefined);
  const [doc0, setDoc0] = useState<string | undefined>(undefined);
  const [doc1, setDoc1] = useState<string | undefined>(undefined);
  const [useJson, setUseJson] = useState<boolean>(false);

  const [gitMode, setGitMode] = useState<boolean>(!!props.desc?.get("gitMode"));
  const [textMode, setTextMode] = useState<boolean>(
    !!props.desc?.get("textMode"),
  );
  const [changesMode, setChangesMode] = useState<boolean>(
    !!props.desc?.get("changesMode"),
  );
  const [version, setVersion] = useState<number | undefined>(
    props.desc?.get("version"),
  );
  const [version0, setVersion0] = useState<number | undefined>(
    props.desc?.get("version0"),
  );
  const [version1, setVersion1] = useState<number | undefined>(
    props.desc?.get("version1"),
  );

  // ensure version consistency
  useEffect(() => {
    const v = gitMode ? gitVersions : versions;
    if (v == null || v.size == 0) {
      return;
    }
    if (changesMode) {
      let v0 = version0;
      let v1 = version1;
      if (v0 == null || v.indexOf(v0) == -1) {
        v0 = v.get(0);
      }
      if (v1 == null || v.indexOf(v1) == -1) {
        v1 = v.get(-1);
      }
      if (v0 == v1 && v.size > 1) {
        if (v0 == v.get(0)) {
          v1 = v.get(1);
        } else if (v1 == v.get(-1)) {
          v0 = v.get(-2);
        } else {
          v0 = v.get(v.indexOf(v1!) - 1);
        }
      }

      if (v0 != version0) {
        setVersion0(v0);
      }
      if (v1 != version1) {
        setVersion1(v1);
      }
    } else {
      if (version == null) {
        setVersion(v.get(-1));
      } else if (v.indexOf(version) == -1) {
        let a;
        if (version < v.get(0)!) {
          a = v.get(0);
        } else if (version > v.get(-1)!) {
          a = v.get(-1);
        } else {
          a = v.get(-1);
        }
        setVersion(a);
      }
    }
  }, [
    version,
    version0,
    version1,
    versions,
    changesMode,
    gitMode,
    versions,
    gitVersions,
  ]);

  useEffect(() => {
    saveState(props.actions, {
      id: props.id,
      version,
      version0,
      version1,
      changesMode,
      gitMode,
      textMode,
    });
  }, [version, version0, version1, changesMode, gitMode, textMode]);

  const getDoc = async (version?: number): Promise<Document | undefined> => {
    version = getVersion(version);
    if (version == null) {
      return;
    }
    if (gitMode) {
      return await props.actions.gitDoc(version);
    }
    return props.actions.get_doc(version);
  };

  // convert from version number to Date object (or undefined)
  const getVersion = (version?: number): number | undefined => {
    if (props.desc == null || versions == null) {
      return;
    }
    return version ?? props.desc?.get("version");
  };

  useAsyncEffect(async () => {
    if (docpath == null) {
      return;
    }
    if (!changesMode) {
      // non-changes mode
      setDoc(await getDoc(version));
    } else {
      // diff mode
      const doc0 = await getDoc(version0);
      if (doc0 == null) return; // something is wrong
      const doc1 = await getDoc(version1);
      if (doc1 == null) return; // something is wrong

      let v0, v1;
      if (docext == "ipynb") {
        v0 = json_stable(to_ipynb(doc0), { space: 1 });
        v1 = json_stable(to_ipynb(doc1), { space: 1 });
        setUseJson(true);
      } else {
        v0 = doc0.to_str();
        v1 = doc1.to_str();
        setUseJson(doc0["value"] == null);
      }
      setDoc0(v0);
      setDoc1(v1);
    }
  }, [
    version,
    version0,
    version1,
    changesMode,
    gitMode,
    versions,
    gitVersions,
  ]);

  const renderVersion = () => {
    const v = gitMode ? gitVersions : versions;
    if (v == null || v.size == 0) {
      return null;
    }
    const max = v.size;
    if (changesMode) {
      if (version0 == null || version1 == null) {
        return null;
      }
      const i0 = versions.indexOf(version0);
      if (i0 == -1) {
        return null;
      }
      const i1 = versions.indexOf(version1);
      if (i1 == -1) {
        return null;
      }
      return (
        <VersionRange
          version0={i0 + startIndex}
          version1={i1 + startIndex}
          max={max + startIndex}
        />
      );
    } else {
      if (version == null) {
        return null;
      }
      const i = versions.indexOf(version);
      if (i == -1) {
        return null;
      }
      return (
        <Version
          date={new Date(version)}
          number={i + 1 + startIndex}
          max={max + startIndex}
        />
      );
    }
  };

  const renderDiff = () => {
    if (!changesMode) {
      return;
    }
    if (doc0 == null || doc1 == null) {
      return renderLoading();
    }

    if (docext == "sagews") {
      return (
        <SagewsDiff
          v0={doc0}
          v1={doc1}
          path={docpath}
          project_id={props.project_id}
          font_size={props.font_size}
          editor_settings={props.editor_settings}
        />
      );
    }

    return (
      <Diff
        v0={doc0}
        v1={doc1}
        path={docpath}
        font_size={props.font_size}
        editor_settings={props.editor_settings}
        use_json={useJson}
      />
    );
  };

  const renderNavigationButtons = () => {
    if (changesMode && (version0 == null || version1 == null)) {
      return;
    }
    return (
      <NavigationButtons
        changesMode={changesMode}
        versions={gitMode ? gitVersions : versions}
        version={version}
        setVersion={setVersion}
        version0={version0}
        setVersion0={setVersion0}
        version1={version1}
        setVersion1={setVersion1}
      />
    );
  };

  const renderNavigationSlider = () => {
    if (changesMode) {
      return;
    }
    return (
      <NavigationSlider
        version={version}
        setVersion={setVersion}
        versions={gitMode ? gitVersions : versions}
      />
    );
  };

  const renderRangeSlider = () => {
    if (!changesMode) {
      return;
    }
    return (
      <RangeSlider
        versions={gitMode ? gitVersions : versions}
        version0={version0}
        setVersion0={setVersion0}
        version1={version1}
        setVersion1={setVersion1}
      />
    );
  };

  const renderAuthor = () => {
    if (version0 == null || version1 == null) {
      return;
    }
    const opts = { actions: props.actions, version0, version1 };
    if (gitMode) {
      return <GitAuthors {...opts} />;
    } else {
      return <TimeTravelAuthors {...opts} />;
    }
  };

  const renderLoadMoreHistory = () => {
    if (gitMode || hasFullHistory) {
      return;
    }
    return (
      <LoadMoreHistory actions={props.actions} disabled={hasFullHistory} />
    );
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
    if (doc == null) {
      return;
    }
    return (
      <RevertFile
        changesMode={changesMode}
        actions={props.actions}
        version={getVersion()}
        id={props.id}
        doc={doc}
      />
    );
  };

  const renderChangesMode = () => {
    const size = (gitMode ? gitVersions : versions)?.size ?? 0;
    return (
      <ChangesMode
        disabled={size <= 1}
        changesMode={changesMode}
        setChangesMode={setChangesMode}
      />
    );
  };

  const renderExport = () => {
    if (gitMode || redux.getStore("page").get("fullscreen") == "kiosk") {
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
        {!changesMode && HAS_SPECIAL_VIEWER.has(docext ?? "") && (
          <Tooltip title="Display underlying file as text">
            <Checkbox
              defaultChecked={textMode}
              onChange={(e) => setTextMode(e.target.checked)}
            >
              Text
            </Checkbox>
          </Tooltip>
        )}
        {git && (
          <>
            <Tooltip title="Show Git history instead of CoCalc edit history">
              <Checkbox
                defaultChecked={gitMode}
                onChange={(e) => setGitMode(e.target.checked)}
              >
                Git
              </Checkbox>
            </Tooltip>
            {gitMode && (
              <Tooltip title="Scan local Git repository for new revisions to this file">
                <Button
                  size="small"
                  style={{ marginRight: "5px" }}
                  onClick={() => {
                    props.actions.updateGitVersions();
                  }}
                >
                  Refresh
                </Button>
              </Tooltip>
            )}
          </>
        )}
        {renderNavigationButtons()}
        <Space.Compact style={{ margin: "0 5px" }}>
          {renderOpenFile()}
          {renderRevertFile()}
          {renderOpenSnapshots()}
          {renderExport()}
          {renderLoadMoreHistory()}
        </Space.Compact>
        {(versions?.size ?? 0) > 0 && (
          <>
            {renderVersion()}
            {", "}
            {renderAuthor()}
          </>
        )}
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

  const renderGitSubject = () => {
    if (version == null) return;
    const subject = props.actions.gitSubject(version);
    if (!subject) return;
    return (
      <div
        style={{
          padding: "5px 0 5px 15px",
          borderTop: "1px solid #ddd",
          background: "#fafafa",
        }}
      >
        {subject}
      </div>
    );
  };

  if (loading) {
    return renderLoading();
  }

  let body;
  if (
    unlicensedLimit &&
    !gitMode &&
    licenses != null &&
    version != null &&
    licenses.size == 0 &&
    versions.size - unlicensedLimit > version
  ) {
    // need license to view this
    body = (
      <RequireLicense
        project_id={project_id}
        message={`A license is required to view more than ${unlicensedLimit} versions of this file.`}
      />
    );
  } else if (doc != null && docpath != null && docext != null && !changesMode) {
    body = (
      <Viewer
        ext={docext}
        doc={doc}
        textMode={textMode}
        actions={props.actions}
        id={props.id}
        path={docpath ? docpath : "a.js"}
        project_id={props.project_id}
        font_size={props.font_size}
        editor_settings={props.editor_settings}
      />
    );
  } else {
    body = renderDiff();
  }

  return (
    <div className="smc-vfill">
      {renderControls()}
      {renderTimeSelect()}
      {gitMode && !changesMode && renderGitSubject()}
      <ShowError
        style={{ margin: "5px 15px" }}
        error={error}
        setError={props.actions.set_error}
      />
      {body}
    </div>
  );
}

const saveState = debounce((actions, obj) => {
  for (const a of [actions, actions.ambient_actions]) {
    if (a == null) continue;
    const node = a._get_frame_node(obj.id);
    if (node == null) continue;
    a.set_frame_tree(obj);
  }
}, 2000);
