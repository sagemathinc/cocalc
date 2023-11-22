/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Active files (editors) in the current project
// Note: there is no corresponding full page – instead, this is based on the "editor tabs"

import { Button, Input, InputRef, Radio, Space } from "antd";
import { sortBy, uniq } from "lodash";

import {
  CSS,
  useActions,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import {
  UNKNOWN_FILE_TYPE_ICON,
  file_options,
} from "@cocalc/frontend/editor-tmp";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
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
  FlyoutActiveStarred,
  getFlyoutActiveMode,
  getFlyoutActiveShowStarred,
  getFlyoutActiveStarred,
  isFlyoutActiveMode,
  storeFlyoutState,
} from "./state";
import { FIX_BORDER } from "../common";
import { FIXED_PROJECT_TABS } from "../file-tab";

const groupSorter = {
  directory: (group: string) => group.toLowerCase(),
  type: (group: string) => {
    // prioritize known file types, and some special ones even more
    // taken from our stats, and adding some, high priority at the start
    const highPriority = [
      "ipynb",
      "sagews",
      "term",
      "md",
      "tex",
      "pdf",
      "txt",
      "py",
      "course",
      "sage-chat",
    ];
    const level = highPriority.indexOf(group.toLowerCase());
    const l = highPriority.length;
    return [
      // it only compares strings, hence we pad with zeros
      String(level >= 0 ? level : l).padStart(3, "0"),
      group.toLowerCase(),
    ];
  },
} as const;

interface Props {
  wrap: (list: JSX.Element, style?: CSS) => JSX.Element;
}

export function ActiveFlyout({ wrap }: Props): JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });

  const [mode, setActiveMode] = useState<FlyoutActiveMode>(
    getFlyoutActiveMode(project_id),
  );
  const [starred, setStarred] = useState<FlyoutActiveStarred>(
    getFlyoutActiveStarred(project_id),
  );
  const filterRef = useRef<InputRef>(null);

  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const recentlyClosed = useTypedRedux({ project_id }, "recently_closed_files");
  //   const user_map = useTypedRedux("users", "user_map");
  const activeTab = useTypedRedux({ project_id }, "active_project_tab");
  const [filterTerm, setFilterTerm] = useState<string>("");
  const [showStarred, setShowStarred] = useState<boolean>(
    getFlyoutActiveShowStarred(project_id),
  );

  function setMode(mode: FlyoutActiveMode) {
    if (isFlyoutActiveMode(mode)) {
      setActiveMode(mode);
      actions?.setFlyoutActiveMode(mode);
    } else {
      console.warn(`Invalid flyout log mode: ${mode}`);
    }
  }

  function setStarredPath(path: string, next: boolean) {
    const newStarred = next
      ? [...starred, path]
      : starred.filter((p) => p !== path);
    setStarred(newStarred);
    storeFlyoutState(project_id, "active", { starred: newStarred });
  }

  useEffect(() => actions?.setFlyoutActiveMode(mode), [mode]);

  const openFilesGrouped: { [group: string]: string[] } = useMemo(() => {
    const searchWords = search_split(filterTerm.trim().toLowerCase());

    // we put starred files first, then open files – everything else is defined by grouping/sorting
    const allFiles = uniq([
      ...starred.filter((path) => {
        if (!showStarred) return false;
        return !path.endsWith("/");
      }),
      ...openFiles.toJS(),
    ]);

    const files = allFiles.filter((path) => {
      // if we have a filter term, then only show files that match
      if (filterTerm === "" || searchWords.length === 0) return true;
      // we only filter based on the base-filename, not the path
      const { tail } = path_split(path);
      return search_match(tail, searchWords);
    });

    if (mode === "tabs") {
      return {}; // we use openFiles directly
    }

    // group files, an array of strings for path/filename, by directory or type (file extension)
    const grouped: { [group: string]: string[] } = {};
    files.forEach((path) => {
      const { head, tail } = path_split(path);
      const group = mode === "directory" ? head : tail.split(".")[1] ?? "";
      if (grouped[group] == null) grouped[group] = [];
      grouped[group].push(path);
    });

    // for all starred directories (starred ending in /)
    // make sure there is a group with an empty string array
    const starredDirectories = starred.filter((path) => path.endsWith("/"));
    starredDirectories.forEach((path) => {
      const dirName = path.slice(0, -1);
      if (grouped[dirName] == null) grouped[dirName] = [];
    });

    return grouped;
  }, [openFiles, mode, filterTerm, starred, showStarred]);

  function renderConfiguration() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        style={{ whiteSpace: "nowrap" }}
        size="small"
      >
        <Radio.Button value="directory">
          <Icon name="folder" /> Folder
        </Radio.Button>
        <Radio.Button value="type">
          <Icon name="file" /> Type
        </Radio.Button>
        <Radio.Button value="tabs">
          <Icon name="database" rotate="270" /> Tabs
        </Radio.Button>
      </Radio.Group>
    );
  }

  function renderToggleShowStarred() {
    return (
      <BootstrapButton
        bsSize="xsmall"
        onClick={() => {
          setShowStarred(!showStarred);
          storeFlyoutState(project_id, "active", { showStarred: !showStarred });
        }}
        title={"Toggle, if stars and starred files should be hidden"}
      >
        <Icon
          name={showStarred ? "star-filled" : "star"}
          style={{ color: COLORS.STAR }}
        />
      </BootstrapButton>
    );
  }

  const activePath = useMemo(() => {
    return tab_to_path(activeTab);
  }, [activeTab]);

  // end of hooks

  function renderFileItem(path: string, how: "file" | "undo", group?: string) {
    const isActive: boolean = activePath === path;
    const style = group != null ? randomLeftBorder(group) : undefined;

    return (
      <FileListItem
        key={path}
        mode="active"
        item={{
          name: path,
          isopen: openFiles.includes(path),
          isactive: isActive,
        }}
        style={style}
        multiline={false}
        onClick={(e) => {
          track("open-file", {
            project_id,
            path,
            how: `flyout-active-${how}-click`,
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
        isStarred={
          showStarred && how === "file" ? starred.includes(path) : undefined
        }
        onStar={(next: boolean) => {
          setStarredPath(path, next);
        }}
        tooltip={
          <span style={{ color: COLORS.GRAY_LLL, fontFamily: "monospace" }}>
            {path}
          </span>
        }
      />
    );
  }

  function getGroupKeys() {
    return sortBy(Object.keys(openFilesGrouped), groupSorter[mode]);
  }

  function getGroupFilenames(group: string): string[] {
    return sortBy(openFilesGrouped[group], (path) => path.toLowerCase());
  }

  function renderGroups(): JSX.Element {
    // flat, same ordering as file tabs
    if (mode === "tabs") {
      const openRendered = openFiles.map((path) => {
        return renderFileItem(path, "file");
      });
      // starred files (no directories) which aren't opened, are at the bottom
      const starredRendered = showStarred
        ? starred
            .filter((path) => !path.endsWith("/") && !openFiles.includes(path))
            .map((path) => {
              return renderFileItem(path, "file");
            })
        : [];
      return (
        <div>
          {openRendered}
          {starredRendered.length > 0 ? (
            <div
              style={{
                ...GROUP_STYLE,
                padding: FLYOUT_PADDING,
                borderTop: FIX_BORDER,
              }}
            >
              <Icon name="star-filled" style={{ color: COLORS.STAR }} /> Starred
            </div>
          ) : undefined}
          {starredRendered}
        </div>
      );
    }

    const groups: JSX.Element[] = [];

    for (const group of getGroupKeys()) {
      // for type mode, we only show groups that have files
      if (mode === "type" && openFilesGrouped[group].length === 0) continue;
      groups.push(
        <Group
          key={group}
          group={group}
          mode={mode}
          openFilesGrouped={openFilesGrouped}
          starred={starred}
          setStarredPath={setStarredPath}
          showStarred={showStarred}
        />,
      );

      for (const path of getGroupFilenames(group)) {
        groups.push(renderFileItem(path, "file", group));
      }
    }

    return <div>{groups}</div>;
  }

  function getOpenedIndex(): number {
    let idx = -1;
    if (mode === "tabs") {
      // the ordering of the tabs
      openFiles.forEach((path, i) => {
        if (path === activePath) {
          idx = i;
          return false;
        }
      });
    } else {
      // our ordering, across the groups
      const groupKeys = getGroupKeys();
      groupKeys.forEach((group, i) => {
        const paths = getGroupFilenames(group);
        paths.forEach((path, j) => {
          if (path === activePath) {
            idx = i + j;
            return false;
          }
        });
        if (idx >= 0) return false;
      });
    }
    return idx;
  }

  function getOpenedFile(idx: number): string {
    let ret = "";
    if (mode === "tabs") {
      openFiles.forEach((path, i) => {
        if (i === idx) {
          ret = path;
          return false;
        }
      });
    } else {
      // our ordering, across the groups
      const groupKeys = getGroupKeys();
      groupKeys.forEach((group, i) => {
        const paths = getGroupFilenames(group);
        paths.forEach((path, j) => {
          if (i + j === idx) {
            ret = path;
            return false;
          }
        });
        if (ret !== "") return false;
      });
    }
    return ret;
  }

  // this depends on the mode. We bascially check if a file is opened.
  // if that's the case, open the next opened file according to the ordering implied by the mode
  function doScroll(dx: -1 | 1) {
    let idx = getOpenedIndex();
    console.log("dx", dx, "idx", idx);
    if (idx === -1) {
      idx = dx === 1 ? 0 : openFiles.size - 1;
    } else {
      idx = strictMod(idx + dx, openFiles.size);
    }
    const openNext = getOpenedFile(idx);
    console.log("openNext", openNext);
    if (openNext !== "") {
      track("open-file", {
        project_id,
        path: openNext,
        how: "flyout-active-scroll-scroll",
      });
      handle_log_click(undefined, openNext, project_id);
      // focus the filter input again
      filterRef.current?.focus();
    }
  }

  function onKeyDownHandler(e) {
    e?.stopPropagation();

    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // if esc key is pressed, empty the search term and reset scroll index
    if (e.key === "Escape") {
      setFilterTerm("");
    }
  }

  function renderUndo() {
    if (recentlyClosed.size === 0) return;

    return (
      <div
        style={{
          flex: "1 1 auto",
          borderTop: FIX_BORDER,
        }}
      >
        <div
          style={{
            padding: FLYOUT_PADDING,
            ...GROUP_STYLE,
            color: COLORS.FILE_EXT,
          }}
        >
          <Icon name="undo" /> Recently closed
          <Button
            size="small"
            style={{ float: "right", color: COLORS.FILE_EXT }}
            onClick={() => actions?.clear_recently_closed_files()}
          >
            <Icon name="times" /> Clear
          </Button>
        </div>
        {recentlyClosed.reverse().map((path) => {
          return renderFileItem(path, "undo");
        })}
      </div>
    );
  }

  return (
    <>
      <Space wrap={false}>
        {renderToggleShowStarred()}
        {renderConfiguration()}
        <Input
          ref={filterRef}
          placeholder="Filter..."
          size="small"
          value={filterTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setFilterTerm(e.target.value);
          }}
          onKeyDown={onKeyDownHandler}
          allowClear
          prefix={<Icon name="search" />}
        />
      </Space>
      {wrap(renderGroups(), { marginTop: "10px" })}
      {renderUndo()}
    </>
  );
}

interface GroupProps {
  group: string;
  mode: FlyoutActiveMode;
  openFilesGrouped: { [group: string]: string[] };
  starred: string[];
  setStarredPath: (path: string, next: boolean) => void;
  showStarred: boolean;
}

const GROUP_STYLE: CSS = {
  fontWeight: "bold",
  marginTop: "5px",
} as const;

function Group({
  group,
  mode,
  openFilesGrouped,
  starred,
  setStarredPath,
  showStarred,
}: GroupProps): JSX.Element {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const current_path = useTypedRedux({ project_id }, "current_path");

  const title = group === "" ? "Home" : group;
  const col = deterministicColor(group);

  const style: CSS = {
    ...GROUP_STYLE,
    backgroundColor: col,
    ...fileItemLeftBorder(col),
  };

  switch (mode) {
    case "directory":
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
            isactive: current_path === group,
          }}
          multiline={false}
          displayedNameOverride={title}
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
            handle_log_click(e, `${group}/`, project_id);
          }}
          tooltip={
            <span style={{ color: COLORS.GRAY_LLL }}>Directory {title}/</span>
          }
        />
      );

    case "type":
      const fileType = file_options(`foo.${group}`);
      const iconName =
        group === "" ? UNKNOWN_FILE_TYPE_ICON : fileType?.icon ?? "file";
      const display = (group === "" ? "No extension" : fileType?.name) || group;
      return (
        <div
          key={group}
          style={{
            ...style,
            padding: FLYOUT_PADDING,
          }}
        >
          <Icon name={iconName} />{" "}
          <span style={{ textTransform: "capitalize" }}>{display}</span>
        </div>
      );

    default:
      return <div key={group}>{group}</div>;
  }
}

function deterministicColor(group: string) {
  return group === ""
    ? COLORS.GRAY_L
    : getRandomColor(group, { diff: 30, min: 180, max: 250 });
}

function randomLeftBorder(group: string): CSS {
  const col = deterministicColor(group);
  return fileItemLeftBorder(col);
}

export function ActiveHeader() {
  // const { project_id } = useProjectContext();

  function renderScroll() {
    return <div style={{ float: "right" }}>up down</div>;
  }

  return (
    <div style={{ flex: 1, fontWeight: "bold" }}>
      <Icon name={FIXED_PROJECT_TABS.active.icon} />{" "}
      {FIXED_PROJECT_TABS.active.label} {renderScroll()}
    </div>
  );
}
