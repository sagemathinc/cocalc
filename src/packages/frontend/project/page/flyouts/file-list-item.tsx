/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  green as ANTD_GREEN,
  orange as ANTD_ORANGE,
  yellow as ANTD_YELLOW,
} from "@ant-design/colors";
import { Button, Dropdown, MenuProps, Tooltip } from "antd";
import immutable from "immutable";

import {
  CSS,
  React,
  useActions,
  useRef,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon, IconName } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
  isDisabledSnapshots,
} from "@cocalc/frontend/project/explorer/action-bar";
import { VIEWABLE_FILE_EXT } from "@cocalc/frontend/project/explorer/file-listing/file-row";
import { url_href } from "@cocalc/frontend/project/utils";
import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";
import {
  filename_extension,
  hexColorToRGBA,
  human_readable_size,
  path_split,
  path_to_file,
  plural,
  separate_file_extension,
  trunc_middle,
} from "@cocalc/util/misc";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS } from "@cocalc/util/theme";
import { FLYOUT_DEFAULT_WIDTH_PX, FLYOUT_PADDING } from "./consts";

// make sure two types of borders are of the same width
const BORDER_WIDTH_PX = "4px";

const FILE_ITEM_SELECTED_STYLE: CSS = {
  backgroundColor: COLORS.BLUE_LLL, // bit lighter than .cc-project-flyout-file-item:hover
} as const;

const FILE_ITEM_OPENED_STYLE: CSS = {
  fontWeight: "bold",
  backgroundColor: COLORS.GRAY_LL,
  color: COLORS.PROJECT.FIXED_LEFT_ACTIVE,
} as const;

const FILE_ITEM_ACTIVE_STYLE: CSS = {
  ...FILE_ITEM_OPENED_STYLE,
  color: COLORS.PROJECT.FIXED_LEFT_OPENED,
};

const FILE_ITEM_ACTIVE_STYLE_2: CSS = {
  ...FILE_ITEM_ACTIVE_STYLE,
  backgroundColor: COLORS.GRAY_L0,
};

const FILE_ITEM_STYLE: CSS = {
  flex: "1",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  overflowWrap: "break-word",
} as const;

const FILE_ITEM_BODY_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  flex: "1",
  padding: FLYOUT_PADDING,
  overflow: "hidden",
} as const;

const FILE_ITEM_LINE_STYLE: CSS = {
  width: "100%",
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  padding: 0,
  margin: 0,
  color: COLORS.GRAY_D,
} as const;

const ICON_STYLE: CSS = {
  fontSize: "120%",
  marginRight: FLYOUT_PADDING,
} as const;

const BTN_STYLE: CSS = {
  fontSize: "11px",
  height: "20px",
  width: "20px",
} as const;

interface Item {
  isopen?: boolean;
  isdir?: boolean;
  isactive?: boolean;
  is_public?: boolean;
  name: string;
  size?: number;
  mask?: boolean;
}

interface FileListItemProps {
  // we only set this from the "files" flyout, not "log", since in the log you can't select multiple files
  checked_files?: immutable.Set<string>;
  displayedNameOverride?: string; // override the name
  extra?: JSX.Element | string | null; // null means don't show anything
  extra2?: JSX.Element | string | null; // null means don't show anything
  iconNameOverride?: IconName;
  index?: number;
  isStarred?: boolean;
  item: Item;
  itemStyle?: CSS;
  mode: "files" | "log" | "active";
  multiline?: boolean;
  onChecked?: (state: boolean) => void;
  onClick?: (e?: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent | undefined, name: string) => void;
  onMouseDown?: (e: React.MouseEvent, name: string) => void;
  onPublic?: (e?: React.MouseEvent) => void;
  onStar?: (next: boolean) => void;
  selected?: boolean;
  setShowCheckboxIndex?: (index: number | null) => void;
  showCheckbox?: boolean;
  style?: CSS;
  tooltip?: JSX.Element | string;
}

export const FileListItem = React.memo((props: Readonly<FileListItemProps>) => {
  const {
    checked_files,
    displayedNameOverride,
    extra,
    extra2,
    iconNameOverride,
    index,
    isStarred,
    item,
    itemStyle,
    mode,
    multiline = false,
    onChecked,
    onClick,
    onClose,
    onMouseDown,
    onPublic,
    onStar,
    selected,
    setShowCheckboxIndex,
    showCheckbox,
    style,
    tooltip,
  } = props;
  const isActive = mode === "active";
  const { project_id } = useProjectContext();
  const current_path = useTypedRedux({ project_id }, "current_path");
  const actions = useActions({ project_id });
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

  const selectable = onChecked != null;
  const itemRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  function renderCloseItem(item: Item): JSX.Element {
    const { name } = item;
    return (
      <Icon
        name="times-circle"
        style={{ flex: "0", fontSize: "120%" }}
        onClick={(e) => {
          e?.stopPropagation();
          onClose?.(e, name);
        }}
      />
    );
  }

  function renderPublishedIcon(): JSX.Element | undefined {
    if (!item.is_public) return undefined;
    return (
      <Tooltip title="File is published" placement="right">
        <Button
          size="small"
          type="text"
          style={BTN_STYLE}
          icon={<Icon name="bullhorn" />}
          onClick={(e) => {
            e.stopPropagation();
            onPublic?.(e);
          }}
        />
      </Tooltip>
    );
  }

  function renderName(): JSX.Element {
    const name = item.name;

    const path = isActive ? path_split(name).tail : name;
    const { name: basename, ext } = item.isdir
      ? { name: path, ext: "" }
      : separate_file_extension(path);

    // de-emphasize starred but closed files, unless a directory
    const activeStyle = isActive
      ? item.isopen
        ? { fontWeight: "bold" }
        : item.isdir
        ? undefined
        : { color: COLORS.FILE_EXT }
      : undefined;

    return (
      <div
        ref={itemRef}
        title={name}
        style={{
          ...FILE_ITEM_STYLE,
          ...(multiline ? { whiteSpace: "normal" } : {}),
          ...activeStyle,
        }}
      >
        {displayedNameOverride ?? basename}
        {displayedNameOverride == null ? (
          ext === "" ? undefined : (
            <span style={{ color: !item.mask ? COLORS.FILE_EXT : undefined }}>
              {`.${ext}`}
            </span>
          )
        ) : undefined}
      </div>
    );
  }

  function handleClick(e: React.MouseEvent): void {
    e.stopPropagation();
    onClick?.(e);
  }

  function handleMouseEnter(): void {
    if (!selectable || index == null) return;
    setShowCheckboxIndex?.(index);
  }

  function handleMouseLeave(): void {
    if (!selectable) return;
    setShowCheckboxIndex?.(null);
  }

  function renderBodyLeft(): JSX.Element {
    const iconName =
      iconNameOverride ??
      (selectable && showCheckbox && item.name !== ".."
        ? selected
          ? "check-square"
          : "square"
        : item.isdir
        ? "folder-open"
        : file_options(item.name)?.icon ?? "file");

    return (
      <Icon
        name={iconName}
        style={ICON_STYLE}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e: React.MouseEvent) => {
          e?.stopPropagation();
          if (onChecked != null) {
            onChecked?.(!selected);
          } else {
            onClick?.(e);
          }
        }}
      />
    );
  }

  function renderStarred(): JSX.Element | undefined {
    if (isStarred == null) return;

    return (
      <Icon
        name={isStarred ? "star-filled" : "star-o"}
        style={{
          ...ICON_STYLE,
          color: isStarred && item.isopen ? COLORS.STAR : COLORS.GRAY_L,
        }}
        onClick={(e: React.MouseEvent) => {
          e?.stopPropagation();
          onStar?.(!isStarred);
        }}
      />
    );
  }

  function renderExtra(type: 1 | 2): JSX.Element | undefined {
    if (extra == null) return;
    const marginRight =
      type === 1
        ? (item.is_public ? 0 : 20) + (item.isopen ? 0 : 18)
        : undefined;
    const widthPx = FLYOUT_DEFAULT_WIDTH_PX * 0.33;
    // if the 2nd extra shows up, fix the width to align the columns
    const width = type === 1 && extra2 != null ? `${widthPx}px` : undefined;
    const maxWidth =
      type === 1 ? `${widthPx}px` : `${FLYOUT_DEFAULT_WIDTH_PX * 0.33}px`;
    const textAlign = "right";
    return (
      <div
        title={typeof extra === "string" ? extra : undefined}
        style={{
          flex: "0 1 auto",
          display: "inline-block",
          color: COLORS.GRAY_M,
          paddingLeft: FLYOUT_PADDING,
          paddingRight: FLYOUT_PADDING,
          marginRight,
          width,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
      >
        <div
          style={{
            maxWidth,
            textOverflow: "ellipsis",
            overflow: "hidden",
            textAlign,
          }}
        >
          {type === 1 ? extra : extra2}
        </div>
      </div>
    );
  }

  function renderBody(): JSX.Element {
    const el = (
      <div
        ref={bodyRef}
        style={FILE_ITEM_BODY_STYLE}
        onClick={handleClick}
        onMouseDown={(e) => {
          onMouseDown?.(e, item.name);
        }}
        // additional mouseLeave to prevent stale hover state icon
        onMouseLeave={handleMouseLeave}
      >
        {renderBodyLeft()} {renderStarred()} {renderName()} {renderExtra(2)}{" "}
        {renderExtra(1)} {renderPublishedIcon()}
        {item.isopen ? renderCloseItem(item) : undefined}
      </div>
    );

    if (!tooltip) return el;

    return (
      <Tooltip
        title={tooltip}
        placement="rightTop"
        style={FILE_ITEM_BODY_STYLE}
      >
        {el}
      </Tooltip>
    );
  }

  function makeContextMenuEntries(
    ctx: NonNullable<MenuProps["items"]>,
    item: Item,
    multiple: boolean,
  ) {
    const { isdir, name: fileName } = item;
    const actionNames = multiple
      ? ACTION_BUTTONS_MULTI
      : isdir
      ? ACTION_BUTTONS_DIR
      : ACTION_BUTTONS_FILE;
    for (const name of actionNames) {
      if (name === "download" && !item.isdir) continue;
      const disabled =
        isDisabledSnapshots(name) &&
        (current_path?.startsWith(".snapshots") ?? false);

      const { name: nameStr, icon, hideFlyout } = FILE_ACTIONS[name];
      if (hideFlyout) return;

      ctx.push({
        key: nameStr,
        label: nameStr,
        icon: <Icon name={icon} />,
        disabled,
        onClick: () => {
          if (!multiple) {
            // we have to check the file, otherwise the explorer's file action won't show it
            if (onChecked != null) {
              onChecked(true);
            } else {
              // if there is no handler for checking a file, only check this file (e.g. "flyout/Log")
              if (fileName === "..") return;
              const pathFn = path_to_file(current_path, fileName);
              actions?.set_all_files_unchecked();
              actions?.set_file_list_checked([pathFn]);
            }
          }
          actions?.set_active_tab("files");
          actions?.set_file_action(name, () => fileName);
        },
      });
    }
  }

  function getContextMenu(): MenuProps["items"] {
    const { name, isdir, is_public, size } = item;
    const n = checked_files?.size ?? 0;
    const multiple = n > 1;

    const sizeStr = size ? human_readable_size(size) : "";
    const nameStr = trunc_middle(item.name, 30);
    const typeStr = isdir ? "Folder" : "File";

    const ctx: NonNullable<MenuProps["items"]> = [];

    if (multiple) {
      ctx.push({
        key: "header",
        icon: <Icon name={"files"} />,
        label: `${n} ${plural(n, "file")}`,
        style: { fontWeight: "bold" },
      });
    } else {
      ctx.push({
        key: "header",
        icon: <Icon name={isdir ? "folder-open" : "file"} />,
        label: `${typeStr} ${nameStr}${sizeStr ? ` (${sizeStr})` : ""}`,
        title: `${name}`,
        style: { fontWeight: "bold" },
      });
      ctx.push({
        key: "open",
        icon: <Icon name="edit-filled" />,
        label: isdir ? "Open folder" : "Open file",
        onClick: () => onClick?.(),
      });
    }

    ctx.push({ key: "divider-header", type: "divider" });

    if (is_public && typeof onPublic === "function") {
      ctx.push({
        key: "public",
        label: "Item is published",
        icon: <Icon name="bullhorn" />,
        onClick: () => onPublic?.(),
      });
    }

    // the file or directory actions
    makeContextMenuEntries(ctx, item, multiple);

    // view/download buttons at the bottom
    const showDownload = !student_project_functionality.disableActions;
    if (name !== ".." && !isdir && showDownload && !multiple) {
      const full_path = path_to_file(current_path, name);
      const ext = (filename_extension(name) ?? "").toLowerCase();
      const showView = VIEWABLE_FILE_EXT.includes(ext);
      const url = url_href(project_id, full_path);

      ctx.push({ key: "divide-download", type: "divider" });

      if (showView) {
        ctx.push({
          key: "view",
          icon: <Icon name="eye" />,
          label: <A href={url}>View file</A>,
        });
      }

      ctx.push({
        key: "download",
        label: "Download",
        icon: <Icon name="cloud-download" />,
        onClick: () => {
          actions?.download_file({ path: full_path, log: true });
        },
      });
    }

    return ctx;
  }

  // if we render this within the "active files flyout", we do not add style
  // because all those files are opened
  const activeStyle: CSS =
    mode === "active"
      ? item.isactive
        ? FILE_ITEM_ACTIVE_STYLE_2
        : {}
      : item.isopen
      ? item.isactive
        ? FILE_ITEM_ACTIVE_STYLE
        : FILE_ITEM_OPENED_STYLE
      : {};

  return (
    <Dropdown menu={{ items: getContextMenu() }} trigger={["contextMenu"]}>
      <div
        key={item.name}
        className="cc-project-flyout-file-item"
        // additional mouseLeave to prevent stale hover state icon
        onMouseLeave={handleMouseLeave}
        style={{
          ...FILE_ITEM_LINE_STYLE,
          ...activeStyle,
          ...itemStyle,
          ...style,
          ...(selected ? FILE_ITEM_SELECTED_STYLE : {}),
        }}
      >
        {renderBody()}
      </div>
    </Dropdown>
  );
});

// Depending on age, highlight  entries from the past past 24 hours and week
export function fileItemStyle(time: number = 0, masked: boolean = false): CSS {
  const diff = server_time().getTime() - time;
  const days = Math.max(0, diff / 1000 / 60 / 60 / 24);
  let col = "rgba(1, 1, 1, 0)";
  if (days < 1 / 24) {
    col = hexColorToRGBA(ANTD_GREEN[3], 1);
  } else if (days < 1) {
    const opacity = 1 - days / 2; // only fade to 50%
    col = hexColorToRGBA(ANTD_ORANGE[3], opacity);
  } else if (days < 14) {
    const opacity = 1 - (days - 1) / 14;
    col = hexColorToRGBA(ANTD_YELLOW[5], opacity);
  }
  return {
    ...fileItemLeftBorder(col),
    ...(masked ? { color: COLORS.GRAY_L } : {}),
  };
}

export function fileItemLeftBorder(col) {
  return { borderLeft: `${BORDER_WIDTH_PX} solid ${col}` };
}
