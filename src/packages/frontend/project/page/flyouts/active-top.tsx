/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Active files (editors) in the current project
// Note: there is no corresponding full page – instead, this is based on the "editor tabs"

import {
  Button,
  Input,
  InputRef,
  Popconfirm,
  Radio,
  Space,
  Tooltip,
} from "antd";

import {
  CSS,
  useActions,
  useMemo,
  useRef,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { COLORS } from "@cocalc/util/theme";
import { FLYOUT_DEFAULT_WIDTH_PX, FLYOUT_PADDING } from "./consts";
import {
  FlyoutActiveMode,
  FlyoutActiveTabSort,
  storeFlyoutState,
} from "./state";
import { unreachable } from "@cocalc/util/misc";

interface ActiveTopProps {
  mode: FlyoutActiveMode;
  setMode: (mode: FlyoutActiveMode) => void;
  showStarred: boolean;
  setShowStarred: (next: boolean) => void;
  filterTerm: string;
  setFilterTerm: (term: string) => void;
  doScroll: (dx: -1 | 1) => void;
  openFirstMatchingFile: () => boolean;
  flyoutWidth: number;
  filteredFiles: string[];
  sortTabs: FlyoutActiveTabSort;
  setSortTabs: (sort: FlyoutActiveTabSort) => void;
}

export function ActiveTop(props: Readonly<ActiveTopProps>) {
  const {
    mode,
    setMode,
    showStarred,
    setShowStarred,
    filterTerm,
    setFilterTerm,
    doScroll,
    openFirstMatchingFile,
    flyoutWidth,
    filteredFiles,
    sortTabs,
    setSortTabs,
  } = props;

  const { project_id } = useProjectContext();
  const filterRef = useRef<InputRef>(null);
  const actions = useActions({ project_id });

  const showText: boolean = useMemo(
    () => flyoutWidth > FLYOUT_DEFAULT_WIDTH_PX * 0.75,
    [flyoutWidth],
  );

  function renderLabelText(text: string) {
    if (!showText) return null;
    return <> {text}</>;
  }

  function renderConfiguration() {
    return (
      <Radio.Group
        value={mode}
        onChange={(val) => setMode(val.target.value)}
        style={{ whiteSpace: "nowrap", justifyContent: "flex-end" }}
        size="small"
      >
        <Tooltip title={"Flat list, custom order by open tabs"} placement="top">
          <Radio.Button value="tabs">
            <Icon name="database" rotate="270" />
            {renderLabelText("Tabs")}
          </Radio.Button>
        </Tooltip>
        <Tooltip title={"Group by folder (directory)"} placement="top">
          <Radio.Button value="folder">
            <Icon name="folder" />
            {renderLabelText("Folder")}
          </Radio.Button>
        </Tooltip>
        <Tooltip title={"Group by file type"} placement="top">
          <Radio.Button value="type">
            <Icon name="file" />
            {renderLabelText("Type")}
          </Radio.Button>
        </Tooltip>
      </Radio.Group>
    );
  }

  function renderToggleShowStarred() {
    return (
      <Tooltip title={"Show/hide starred files"} placement="top">
        <Button
          size="small"
          onClick={() => {
            setShowStarred(!showStarred);
            storeFlyoutState(project_id, "active", {
              showStarred: !showStarred,
            });
          }}
        >
          <Icon
            name={showStarred ? "star-filled" : "star"}
            style={{ color: COLORS.STAR }}
          />
          {renderLabelText("Starred")}
        </Button>
      </Tooltip>
    );
  }

  function render1stRow() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: FLYOUT_PADDING,
        }}
      >
        {renderToggleShowStarred()}
        {renderConfiguration()}
      </div>
    );
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

    // upon return, open first match
    if (e.key === "Enter") {
      if (openFirstMatchingFile()) setFilterTerm("");
    }
  }

  // toggle through all active tab sort states
  function renderActiveTabSortButton() {
    if (mode !== "tabs") return null;

    let icon: React.ReactNode;
    let nextSort: FlyoutActiveTabSort;
    let title: string = "";

    switch (sortTabs) {
      case "custom":
        icon = <Icon name="database" rotate="270" />;
        nextSort = "alphanum-down";
        title =
          "Showing open files in custom order (drag to reorder). Click to sort alphabetically.";
        break;
      case "alphanum-down":
        icon = <Icon name="sort-amount-up" rotate="180" />;
        nextSort = "alphanum-up";
        title =
          "Showing open files in alphabetical order (A-Z). Click to sort in reverse alphabetical order.";
        break;
      case "alphanum-up":
        icon = <Icon name="sort-amount-up" />;
        nextSort = "custom";
        title =
          "Showing open files in reverse alphabetical order (Z-A). Click to sort in custom order.";
        break;
      default:
        unreachable(sortTabs);
    }

    return (
      <Tooltip title={title} placement="top">
        <Button
          size="small"
          icon={icon}
          onClick={() => {
            setSortTabs(nextSort);
          }}
        />
      </Tooltip>
    );
  }

  function render2ndRowButtons() {
    return (
      <Space
        direction="horizontal"
        size="small"
        style={{ flex: "1 0 auto", justifyContent: "flex-end" }}
      >
        {renderActiveTabSortButton()}

        <Popconfirm
          title="Close all tabs?"
          onConfirm={() => {
            filteredFiles.map((path) => actions?.close_tab(path));
          }}
          okText="Yes"
          cancelText="No"
        >
          <Button
            size="small"
            title={"Close all"}
            icon={<Icon name="times-circle" />}
          />
        </Popconfirm>
      </Space>
    );
  }

  function render2ndRow() {
    const style: CSS = {
      width: "6em",
      flex: "1 1 auto",
      paddingRight: FLYOUT_PADDING,
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Tooltip
          title={
            <>
              Filter opened and starred files. [Return] openes the first match,
              [ESC] clears the filter.
            </>
          }
          placement="top"
        >
          <Input
            ref={filterRef}
            placeholder="Filter..."
            style={style}
            size="small"
            value={filterTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setFilterTerm(e.target.value);
            }}
            onKeyDown={onKeyDownHandler}
            allowClear
            prefix={<Icon name="search" />}
          />
        </Tooltip>
        {render2ndRowButtons()}
      </div>
    );
  }

  return (
    <>
      {render1stRow()}
      {render2ndRow()}
    </>
  );
}
