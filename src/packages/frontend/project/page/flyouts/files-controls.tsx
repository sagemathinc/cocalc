/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Descriptions, Space, Tooltip } from "antd";
import immutable from "immutable";
import { useIntl } from "react-intl";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
  isDisabledSnapshots,
} from "@cocalc/frontend/project/explorer/action-bar";
import type {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import { human_readable_size, path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PANEL_STYLE_BOTTOM, PANEL_STYLE_TOP } from "./consts";
import { useSingleFile } from "./utils";

interface FilesSelectedControlsProps {
  checked_files: immutable.Set<string>;
  directoryFiles: DirectoryListing;
  getFile: (path: string) => DirectoryListingEntry | undefined;
  mode: "top" | "bottom";
  project_id: string;
  showFileSharingDialog(file): void;
  open: (
    e: React.MouseEvent | React.KeyboardEvent,
    index: number,
    skip?: boolean,
  ) => void;
  activeFile: DirectoryListingEntry | null;
}

export function FilesSelectedControls({
  checked_files,
  directoryFiles,
  getFile,
  mode,
  open,
  project_id,
  showFileSharingDialog,
  activeFile,
}: FilesSelectedControlsProps) {
  const intl = useIntl();
  const current_path = useTypedRedux({ project_id }, "current_path");
  const actions = useActions({ project_id });

  const singleFile = useSingleFile({
    checked_files,
    activeFile,
    getFile,
    directoryFiles,
  });

  async function openAllSelectedFiles(e: React.MouseEvent) {
    e.stopPropagation();
    const skipDirs = checked_files.size > 1;
    for (const file of checked_files) {
      const basename = path_split(file).tail;
      const index = directoryFiles.findIndex((f) => f.name === basename);
      // skipping directories, because it makes no sense to flip through them rapidly
      if (skipDirs && getFile(file)?.isDir) {
        open(e, index, true);
        continue;
      }
      open(e, index);
      // wait 10ms to avoid opening all files at once
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function renderFileInfoTop() {
    if (checked_files.size !== 0) return;

    let [nFiles, nDirs] = [0, 0];
    for (const f of directoryFiles) {
      if (f.isDir) {
        nDirs++;
      } else {
        nFiles++;
      }
    }

    return (
      <div style={{ color: COLORS.GRAY_M }}>
        <Icon name="files" /> {nFiles} {plural(nFiles, "file")}, {nDirs}{" "}
        {plural(nDirs, "folder")}
      </div>
    );
  }

  function renderFileInfoBottom() {
    if (singleFile != null) {
      const { size, mtime, isDir } = singleFile;
      const age = typeof mtime === "number" ? mtime : null;
      return (
        <Descriptions size="small" layout="horizontal" column={1}>
          {age ? (
            <Descriptions.Item label="Modified" span={1}>
              <TimeAgo date={new Date(age)} />
            </Descriptions.Item>
          ) : undefined}
          {isDir ? (
            <Descriptions.Item label="Contains">
              {size} {plural(size, "item")}
            </Descriptions.Item>
          ) : (
            <Descriptions.Item label="Size">
              {human_readable_size(size)}
            </Descriptions.Item>
          )}
          {singleFile.isPublic ? (
            <Descriptions.Item label="Published">
              <Button
                size="small"
                icon={<Icon name="share-square" />}
                onClick={(e) => {
                  e.stopPropagation();
                  showFileSharingDialog(singleFile);
                }}
              >
                configure
              </Button>
            </Descriptions.Item>
          ) : undefined}
        </Descriptions>
      );
    } else {
      // summary of multiple selected files
      if (checked_files.size > 1) {
        let [totSize, startDT, endDT] = [0, new Date(0), new Date(0)];
        for (const f of checked_files) {
          const file = getFile(f);
          if (file == null) continue;
          const { size = 0, mtime, isDir } = file;
          totSize += isDir ? 0 : size;
          if (typeof mtime === "number") {
            const dt = new Date(mtime);
            if (startDT.getTime() === 0 || dt < startDT) startDT = dt;
            if (endDT.getTime() === 0 || dt > endDT) endDT = dt;
          }
        }

        return (
          <Descriptions size="small" layout="horizontal" column={1}>
            <Descriptions.Item label="Total size" span={1}>
              {human_readable_size(totSize)}
            </Descriptions.Item>
            {startDT.getTime() > 0 ? (
              <Descriptions.Item label="Modified" span={1}>
                <div>
                  <TimeAgo date={startDT} /> – <TimeAgo date={endDT} />
                </div>
              </Descriptions.Item>
            ) : undefined}
          </Descriptions>
        );
      }
    }
  }

  function renderFileInfo() {
    if (mode === "top") {
      return renderFileInfoTop();
    } else {
      return renderFileInfoBottom();
    }
  }

  function renderOpenFile() {
    if (checked_files.size === 0) return;
    return (
      <Tooltip
        title={
          checked_files.size === 1
            ? "Or double-click file in listing"
            : "Open all selected files"
        }
      >
        <Button type="primary" size="small" onClick={openAllSelectedFiles}>
          <Icon name="edit-filled" /> Edit
          {checked_files.size > 1 ? " all" : ""}
        </Button>
      </Tooltip>
    );
  }

  function renderButtons(names) {
    if (mode === "top" && checked_files.size === 0) return;

    return (
      <Space direction="horizontal" wrap>
        {checked_files.size > 0 ? renderOpenFile() : undefined}
        <Space.Compact size="small">
          {names.map((name) => {
            const disabled =
              isDisabledSnapshots(name) &&
              (current_path?.startsWith(".snapshots") ?? false);

            const { name: actionName, icon, hideFlyout } = FILE_ACTIONS[name];
            const title = intl.formatMessage(actionName);
            if (hideFlyout) return;
            return (
              <Tooltip key={name} title={`${title}...`}>
                <Button
                  size="small"
                  key={name}
                  disabled={disabled}
                  onClick={() => {
                    // TODO re-using the existing controls is a stopgap. make this part of the flyouts.
                    actions?.set_active_tab("files");
                    actions?.set_file_action(name);
                  }}
                >
                  <Icon name={icon} />
                </Button>
              </Tooltip>
            );
          })}
        </Space.Compact>
      </Space>
    );
  }

  return (
    <Space
      direction="vertical"
      size="small"
      style={mode === "top" ? PANEL_STYLE_TOP : PANEL_STYLE_BOTTOM}
    >
      {singleFile
        ? singleFile.isDir
          ? renderButtons(ACTION_BUTTONS_DIR)
          : renderButtons(ACTION_BUTTONS_FILE.filter((n) => n !== "download"))
        : checked_files.size > 1
          ? renderButtons(ACTION_BUTTONS_MULTI)
          : undefined}
      {renderFileInfo()}
    </Space>
  );
}
