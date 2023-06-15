/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  green as ANTD_GREEN,
  orange as ANTD_ORANGE,
  yellow as ANTD_YELLOW,
} from "@ant-design/colors";
import { Tag, Tooltip } from "antd";

import { CSS, useRef } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { hexColorToRGBA } from "@cocalc/util/misc";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS } from "@cocalc/util/theme";

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

const FILE_ITEM_STYLE: CSS = {
  flex: "1 1 auto",
  display: "flex",
  flexDirection: "row",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const FILE_ITEM_BODY_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  flex: "1",
  padding: "5px",
} as const;

const FILE_ITEM_LINE_STYLE: CSS = {
  display: "flex",
  flexDirection: "row",
  width: "100%",
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  padding: 0,
  margin: 0,
  color: COLORS.GRAY_D,
} as const;

const ICON_STYLE: CSS = { fontSize: "120%", marginRight: "5px" } as const;

interface Item {
  isopen?: boolean;
  isactive?: boolean;
  name: string;
}

interface FileListItemProps {
  onClick?: (e: React.MouseEvent) => void;
  onClose?: (e: React.MouseEvent | undefined, name: string) => void;
  onOpen?: (e: React.MouseEvent) => void;
  itemStyle?: CSS;
  item: Item;
  renderIcon: (item: Item, style: CSS) => JSX.Element;
  tooltip?: JSX.Element | string;
  selected?: boolean;
  multiline?: boolean;
}

export function FileListItem({
  onClick,
  onClose,
  onOpen,
  item,
  renderIcon,
  itemStyle,
  tooltip,
  selected,
  multiline = false,
}: FileListItemProps): JSX.Element {
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

  function renderOpenItem(): JSX.Element {
    return (
      <Tag
        bordered={false}
        icon={<Icon name="external-link" />}
        color={COLORS.ANTD_GREEN}
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.(e);
        }}
      >
        Open
      </Tag>
    );
  }

  function renderItem(): JSX.Element {
    return (
      <div
        ref={itemRef}
        style={{
          ...FILE_ITEM_STYLE,
          ...(multiline ? { whiteSpace: "normal" } : {}),
        }}
      >
        {item.name}
      </div>
    );
  }

  function handleClick(e: React.MouseEvent): void {
    if (e.target === itemRef.current || e.target === bodyRef.current) {
      e.stopPropagation();
      onClick?.(e);
    }
  }

  function renderBody(): JSX.Element {
    const el = (
      <div ref={bodyRef} style={FILE_ITEM_BODY_STYLE} onClick={handleClick}>
        {renderIcon(item, ICON_STYLE)} {renderItem()}
        {item.isopen
          ? renderCloseItem(item)
          : selected
          ? renderOpenItem()
          : undefined}
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

  return (
    <div
      className="cc-project-flyout-file-item"
      style={{
        ...FILE_ITEM_LINE_STYLE,
        ...(item.isopen
          ? item.isactive
            ? FILE_ITEM_ACTIVE_STYLE
            : FILE_ITEM_OPENED_STYLE
          : {}),
        ...itemStyle,
        ...(selected ? FILE_ITEM_SELECTED_STYLE : {}),
      }}
    >
      {renderBody()}
    </div>
  );
}

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
    borderLeft: `${BORDER_WIDTH_PX} solid ${col}`,
    ...(masked ? { color: COLORS.GRAY_L } : {}),
  };
}
