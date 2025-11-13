/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Group headers of active files (editors) in the current project

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import {
  UNKNOWN_FILE_TYPE_ICON,
  file_options,
} from "@cocalc/frontend/editor-tmp";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { handleFileEntryClick } from "@cocalc/frontend/project/history/utils";
import track from "@cocalc/frontend/user-tracking";
import { capitalize, trunc_middle } from "@cocalc/util/misc";
import { ACTIVE_FOLDER_TYPE, FLYOUT_PADDING } from "./consts";
import { FileListItem } from "./file-list-item";
import { FlyoutActiveMode } from "./state";
import { GROUP_STYLE, deterministicColor, fileItemBorder } from "./utils";

interface GroupProps {
  group: string;
  mode: FlyoutActiveMode;
  openFilesGrouped: { [group: string]: string[] };
  starred: string[];
  setStarredPath: (path: string, next: boolean) => void;
  showStarred: boolean;
  isLast?: boolean; // if group is empty, it is also the last one in the group
}

export function Group({
  group,
  mode,
  openFilesGrouped,
  starred,
  setStarredPath,
  showStarred,
  isLast = false,
}: GroupProps): React.JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const current_path = useTypedRedux({ project_id }, "current_path");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");

  const components = group.replace(/^\.smc\/root\//, "/").split("/");
  const parts = [
    ...components.slice(0, -2).map(() => "•"), // &bull;
    ...components.slice(-2).map((x) => trunc_middle(x, 15)),
  ];
  const displayed = group === "" ? "Home" : parts.join("/");

  const col = deterministicColor(group);

  const style: CSS = {
    ...GROUP_STYLE,
    ...fileItemBorder(col, "left"),
    ...fileItemBorder(col, "top"),
    ...(isLast ? fileItemBorder(col, "bottom") : {}),
  } as const;

  function getTypeIconDisplay(group: string): {
    iconName: IconName;
    display: string;
  } {
    if (group === ACTIVE_FOLDER_TYPE) {
      return {
        iconName: "folder",
        display: "Starred folder",
      };
    }

    const fileType = file_options(`foo.${group}`);
    return {
      iconName:
        group === "" ? UNKNOWN_FILE_TYPE_ICON : fileType?.icon ?? "file",
      display: (group === "" ? "No extension" : fileType?.name) || group,
    };
  }

  switch (mode) {
    case "folder":
      const isHome = group === "";
      const isopen = openFilesGrouped[group].some((path) =>
        openFiles.includes(path),
      );
      return (
        <FileListItem
          key={group}
          style={style}
          mode="active"
          item={{
            name: group,
            isdir: true,
            isopen,
            isactive: current_path === group && activeTab === "files",
          }}
          multiline={false}
          displayedNameOverride={displayed}
          iconNameOverride={isHome ? "home" : undefined}
          isStarred={
            isHome || !showStarred ? undefined : starred.includes(`${group}/`)
          }
          onStar={(next) => {
            setStarredPath(`${group}/`, next);
          }}
          onClose={(e: React.MouseEvent) => {
            e.stopPropagation();
            track("open-file", {
              project_id,
              group,
              how: "flyout-active-directory-close",
            });
            // close all files in that group
            for (const path of openFilesGrouped[group]) {
              actions?.close_tab(path);
            }
          }}
          onClick={(e) => {
            track("open-file", {
              project_id,
              group,
              how: "flyout-active-directory-open",
            });
            // trailing slash indicates to open a directory
            handleFileEntryClick(e, `${group}/`, project_id);
          }}
        />
      );

    case "type":
      const { iconName, display } = getTypeIconDisplay(group);
      const displayCapitalized =
        display.includes(" ") || display.length > 4
          ? capitalize(display)
          : display.toUpperCase();
      return (
        <div
          key={group}
          style={{
            ...style,
            padding: FLYOUT_PADDING,
          }}
        >
          <Icon name={iconName} /> {displayCapitalized}
        </div>
      );

    default:
      return <div key={group}>{group}</div>;
  }
}
