/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Active files (editors) in the current project
// Note: there is no corresponding full page – instead, this is based on the "editor tabs"

import { Input, Radio } from "antd";

import {
  CSS,
  useActions,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { handle_log_click } from "@cocalc/frontend/project/history/utils";
import track from "@cocalc/frontend/user-tracking";
import {
  getRandomColor,
  path_split,
  search_match,
  search_split,
  strictMod,
  tab_to_path,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FLYOUT_PADDING } from "./consts";
import { FileListItem, fileItemLeftBorder } from "./file-list-item";
import {
  FlyoutActiveMode,
  getFlyoutActiveMode,
  isFlyoutActiveMode,
} from "./state";
import { sortBy } from "lodash";

interface Props {
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function ActiveFlyout({ wrap }: Props): JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  const [mode, setActiveMode] = useState<FlyoutActiveMode>(
    getFlyoutActiveMode(project_id),
  );

  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  //   const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [scrollIdx, setScrollIdx] = useState<number | null>(null);

  function setMode(mode: FlyoutActiveMode) {
    if (isFlyoutActiveMode(mode)) {
      setActiveMode(mode);
      actions?.setFlyoutActiveMode(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  useEffect(() => actions?.setFlyoutActiveMode(mode), [mode]);

  const openFilesGrouped = useMemo(() => {
    const searchWords = search_split(filterTerm.trim().toLowerCase());
    const files = openFiles.filter((path) => {
      if (filterTerm === "") return true;
      if (searchWords.length === 0) return true;
      const { tail } = path_split(path);
      return search_match(tail, searchWords);
    });

    if (mode === "tabs") {
      return files;
    }

    // group files, an array of strings for path/filename, by directory or type (file extension)
    const grouped: { [group: string]: string[] } = {};
    files.forEach((path) => {
      const { head, tail } = path_split(path);
      const group = mode === "directory" ? head : tail.split(".")[1] ?? "";
      if (grouped[group] == null) grouped[group] = [];
      grouped[group].push(path);
    });
    return grouped;
  }, [openFiles, mode, filterTerm]);

  function renderConfiguration() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        size="small"
      >
        <Radio.Button value="directory">Directory</Radio.Button>
        <Radio.Button value="type">Type</Radio.Button>
        <Radio.Button value="tabs">Tabs</Radio.Button>
      </Radio.Group>
    );
  }

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  // end of hooks

  function renderFileItem(path: string, group?: string) {
    const isActive: boolean = activePath === path;
    const style = group != null ? randomLeftBorder(group) : undefined;

    return (
      <FileListItem
        key={path}
        mode="active"
        item={{ name: path, isopen: true, isactive: isActive }}
        style={style}
        multiline={true}
        onClick={(e) => {
          track("open-file", {
            project_id,
            path,
            how: "click-on-active-file-flyout",
          });
          handle_log_click(e, path, project_id);
        }}
        onClose={(e: React.MouseEvent, path: string) => {
          e.stopPropagation();
          actions?.close_tab(path);
        }}
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 1) {
            // middle mouse click
            actions?.close_tab(path);
          }
        }}
        tooltip={
          <span style={{ color: COLORS.GRAY_LLL, fontFamily: "monospace" }}>
            {path}
          </span>
        }
      />
    );
  }

  function renderGroups(): JSX.Element {
    // flat, same ordering as file tabs
    if (mode === "tabs") {
      return (
        <div>
          {openFiles.map((path) => {
            return renderFileItem(path);
          })}
        </div>
      );
    }

    const groups: JSX.Element[] = [];
    const groupKeys = sortBy(Object.keys(openFilesGrouped), (group) =>
      group.toLowerCase(),
    );

    for (const group in groupKeys) {
      groups.push(<Group group={group} mode={mode} />);

      const filenames = sortBy(openFilesGrouped[group], (path) =>
        path.toLowerCase(),
      );
      for (const path of filenames) {
        groups.push(renderFileItem(path, group));
      }
    }

    return <div>{groups}</div>;
  }

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      openFiles.size,
    );
    setScrollIdx(nextIdx);
  }

  function open(e: React.MouseEvent | React.KeyboardEvent, index: number) {
    const file: string | undefined = openFiles.get(index);
    if (file == null) return;
    track("open-file", {
      project_id,
      path: file,
      how: "keypress-on-log-file-flyout",
    });
    handle_log_click(e, file, project_id);
  }

  function onKeyDownHandler(e) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // return key pressed
    else if (e.code === "Enter") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (filterTerm != "" && openFiles.size > 0) {
        open(e, 0);
      }
    }

    // if esc key is pressed, empty the search term and reset scroll index
    if (e.key === "Escape") {
      setScrollIdx(null);
      setFilterTerm("");
    }
  }

  return (
    <>
      {renderConfiguration()}
      <Input
        placeholder="Filter..."
        style={{ flex: "1", marginRight: "10px" }}
        size="small"
        value={filterTerm}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setFilterTerm(e.target.value);
        }}
        onKeyDown={onKeyDownHandler}
        allowClear
        prefix={<Icon name="search" />}
      />
      {wrap(renderGroups(), { marginTop: "10px" })}
    </>
  );
}

const GROUP_STYLE: CSS = {
  fontWeight: "bold",
  marginTop: "5px",
} as const;

function Group({
  group,
  mode,
}: {
  group: string;
  mode: FlyoutActiveMode;
}): JSX.Element {
  const { project_id } = useProjectContext();
  const title = group === "" ? "$HOME" : group;
  const col = deterministicColor(group);

  const style: CSS = {
    ...GROUP_STYLE,
    backgroundColor: col,
    ...fileItemLeftBorder(col),
  };

  switch (mode) {
    case "directory":
      return (
        <FileListItem
          key={group}
          style={style}
          mode="active"
          item={{ name: group, isdir: true, isopen: false, isactive: false }}
          multiline={false}
          displayedNameOverride={group === "" ? "$HOME" : group}
          iconNameOverride={group === "" ? "home" : undefined}
          onClick={(e) => {
            track("open-file", {
              project_id,
              group,
              how: "click-on-active-directory-flyout",
            });
            handle_log_click(e, group, project_id);
          }}
          tooltip={
            <span style={{ color: COLORS.GRAY_LLL, fontFamily: "monospace" }}>
              {title}/
            </span>
          }
        />
      );
    case "type":
      return (
        <div
          key={group}
          style={{
            ...style,
            padding: FLYOUT_PADDING,
          }}
        >
          <Icon name="file" /> {group}
        </div>
      );
    default:
      return <></>;
  }
}

function deterministicColor(group: string) {
  return group === "" ? COLORS.GRAY_L : getRandomColor(group);
}

function randomLeftBorder(group: string): CSS {
  const col = deterministicColor(group);
  return fileItemLeftBorder(col);
}
