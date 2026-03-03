/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumb, Button, Dropdown, Flex, Space, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useCallback, useRef } from "react";

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { trunc_middle } from "@cocalc/util/misc";
import { createPathSegmentLink } from "./path-segment-link";

const LONG_PRESS_MS = 400;

/** Style for items in the long-press history dropdown */
const DROPDOWN_MENU_STYLE: React.CSSProperties = {
  maxHeight: "30vh",
  overflowY: "auto",
  overflowX: "hidden",
  maxWidth: 350,
};

interface Props {
  project_id: string;
  style?: React.CSSProperties;
  className?: string;
  mode?: "files" | "flyout";
  /**
   * Override the browsing path shown in the breadcrumb.
   * When omitted, reads `current_path` from the Redux store.
   */
  currentPath?: string;
  /**
   * Override the history path used for breadcrumb depth.
   * When omitted, reads `history_path` from the Redux store.
   */
  historyPath?: string;
  /**
   * Called instead of `actions.open_directory` when the user clicks a
   * breadcrumb segment or the up/home buttons.  When omitted, falls
   * back to `actions.open_directory(path, true, false)`.
   */
  onNavigate?: (path: string) => void;
  /** Browser-like back/forward navigation */
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  /** History entries for long-press dropdowns */
  backHistory?: string[];
  forwardHistory?: string[];
}

/**
 * Build antd menu items from a list of directory paths.
 * Clicking an item navigates to that directory (as a new navigation,
 * not a back/forward step).
 */
function historyMenuItems(
  paths: string[],
  navigate: (path: string) => void,
): MenuProps["items"] {
  return paths.map((p, i) => ({
    key: `${i}-${p}`,
    label: (
      <span
        title={p || "Home"}
        style={{
          display: "block",
          maxWidth: 320,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {p || "Home"}
      </span>
    ),
    onClick: () => navigate(p),
  }));
}

/**
 * A button that fires onClick on normal click and shows a dropdown
 * on long-press (~400ms hold).
 */
function LongPressButton({
  icon,
  disabled,
  onClick,
  title,
  dropdownItems,
}: {
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  dropdownItems?: MenuProps["items"];
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // When the dropdown is open, listen for clicks outside to close it,
  // AND for pointerup anywhere to support press-drag-release selection
  // (like native browser back/forward menus).
  React.useEffect(() => {
    if (!dropdownOpen) return;

    function handlePointerUpOnDocument(e: PointerEvent) {
      // Find element under the cursor — might be a menu item the
      // user dragged to after long-pressing the button.
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const menuItem = el?.closest?.(
        ".ant-dropdown-menu-item",
      ) as HTMLElement | null;
      if (menuItem) {
        // Simulate a click on the menu item so antd fires its onClick
        menuItem.click();
        return; // menu onClick handler will close the dropdown
      }
      // Released outside any menu item — close the dropdown
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }

    // Delay registration so the opening pointerup doesn't immediately close
    const timer = setTimeout(
      () => document.addEventListener("pointerup", handlePointerUpOnDocument),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerup", handlePointerUpOnDocument);
    };
  }, [dropdownOpen]);

  const handlePointerDown = useCallback(() => {
    if (disabled) return;
    longPressedRef.current = false;
    timerRef.current = setTimeout(() => {
      longPressedRef.current = true;
      if (dropdownItems && dropdownItems.length > 0) {
        setDropdownOpen(true);
      }
    }, LONG_PRESS_MS);
  }, [disabled, dropdownItems]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!longPressedRef.current && !disabled) {
      onClick();
    }
  }, [disabled, onClick]);

  const handlePointerLeave = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const btn = (
    <Tooltip title={dropdownOpen ? "" : title}>
      <Button
        icon={icon}
        type="text"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={(e) => e.preventDefault()}
      />
    </Tooltip>
  );

  if (!dropdownItems || dropdownItems.length === 0) {
    return btn;
  }

  return (
    <div ref={wrapperRef} style={{ display: "inline-block" }}>
      <Dropdown
        open={dropdownOpen}
        onOpenChange={setDropdownOpen}
        trigger={[]}
        menu={{
          items: dropdownItems,
          style: DROPDOWN_MENU_STYLE,
          onClick: () => setDropdownOpen(false),
        }}
      >
        {btn}
      </Dropdown>
    </div>
  );
}

// This path consists of several PathSegmentLinks
export const PathNavigator: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
    const {
      project_id,
      style,
      className = "cc-path-navigator",
      mode = "files",
      onNavigate,
      canGoBack,
      canGoForward,
      onGoBack,
      onGoForward,
      backHistory,
      forwardHistory,
    } = props;
    const reduxCurrentPath = useTypedRedux({ project_id }, "current_path");
    const reduxHistoryPath = useTypedRedux({ project_id }, "history_path");
    const actions = useActions({ project_id });

    const currentPath = props.currentPath ?? reduxCurrentPath;
    const historyPath = props.historyPath ?? reduxHistoryPath;

    const navigate = (path: string) => {
      if (onNavigate) {
        onNavigate(path);
      } else {
        actions?.open_directory(path, true, false);
      }
    };

    function make_path() {
      const v: any[] = [];

      const currentPathDepth =
        (currentPath == "" ? 0 : currentPath.split("/").length) - 1;
      const historySegments = historyPath.split("/");
      const isRoot = currentPath[0] === "/";

      const homeStyle: CSS = {
        fontSize: style?.fontSize,
        fontWeight: "bold",
      } as const;

      const homeDisplay =
        mode === "files" ? (
          <>
            <HomeOutlined style={homeStyle} />{" "}
            <span style={homeStyle}>Home</span>
          </>
        ) : (
          <HomeOutlined style={homeStyle} />
        );

      v.push(
        createPathSegmentLink({
          path: "",
          display: (
            <Tooltip title="Go to home directory">{homeDisplay}</Tooltip>
          ),
          full_name: "",
          key: 0,
          on_click: () => navigate(""),
          active: currentPathDepth === -1,
          dndNamespace: mode,
        }),
      );

      const pathLen = currentPathDepth;
      const condense = mode === "flyout";

      historySegments.forEach((segment, i) => {
        if (isRoot && i === 0) return;
        const is_current = i === currentPathDepth;
        const is_history = i > currentPathDepth;

        // don't show too much in flyout mode
        const hide =
          condense &&
          ((i < pathLen && i <= pathLen - 2) ||
            (i > pathLen && i >= pathLen + 2));

        v.push(
          // yes, must be called as a normal function.
          createPathSegmentLink({
            path: historySegments.slice(0, i + 1 || undefined).join("/"),
            display: hide ? <>&bull;</> : trunc_middle(segment, 15),
            full_name: segment,
            key: i + 1,
            on_click: (path) => navigate(path),
            active: is_current,
            history: is_history,
            dndNamespace: mode,
          }),
        );
      });
      return v;
    }

    // Show a swap button when the browsing path diverges from
    // the project-wide current_path (active file context).
    const pathsDiverge = onNavigate != null && currentPath !== reduxCurrentPath;

    function renderNavButtons() {
      const hasBackForward = onGoBack != null && onGoForward != null;
      const canGoUp = currentPath !== "";

      const backBtn = hasBackForward ? (
        <LongPressButton
          icon={<Icon name="left-circle-o" />}
          disabled={!canGoBack}
          onClick={onGoBack!}
          title="Go back to previous directory"
          dropdownItems={
            backHistory ? historyMenuItems(backHistory, navigate) : undefined
          }
        />
      ) : null;

      const forwardBtn = hasBackForward ? (
        <LongPressButton
          icon={<Icon name="right-circle-o" />}
          disabled={!canGoForward}
          onClick={onGoForward!}
          title="Go forward to next directory"
          dropdownItems={
            forwardHistory
              ? historyMenuItems(forwardHistory, navigate)
              : undefined
          }
        />
      ) : null;

      const upBtn =
        mode === "files" ? (
          <Button
            icon={<Icon name="arrow-circle-up" />}
            type="text"
            onClick={() => {
              if (!canGoUp) return;
              const pathSegments = currentPath.split("/");
              pathSegments.pop();
              const parentPath = pathSegments.join("/");
              navigate(parentPath);
            }}
            disabled={!canGoUp}
            title={
              canGoUp ? "Go up one directory" : "Already at home directory"
            }
          />
        ) : null;

      // Always render to reserve space — invisible placeholder when paths match.
      const syncBtn = onNavigate != null && (
        <Tooltip
          title={
            pathsDiverge
              ? `Switch to the directory of the currently active file: ${reduxCurrentPath || "Home"}`
              : ""
          }
        >
          <Button
            icon={<Icon name="swap" />}
            type="text"
            disabled={!pathsDiverge}
            style={pathsDiverge ? undefined : { opacity: 0, cursor: "default" }}
            onClick={() => pathsDiverge && navigate(reduxCurrentPath)}
          />
        </Tooltip>
      );

      // Only wrap in Space.Compact if there are back/forward buttons
      if (hasBackForward) {
        return (
          <Space.Compact size="small">
            {syncBtn}
            {backBtn}
            {forwardBtn}
            {upBtn}
          </Space.Compact>
        );
      }

      // Fallback: no back/forward (legacy callers)
      return (
        <>
          {syncBtn}
          {upBtn}
        </>
      );
    }

    // Background color is set via .cc-project-files-path-nav > nav
    // so that things look good even for multiline long paths.
    const bc = (
      <Breadcrumb style={style} className={className} items={make_path()} />
    );
    return mode === "files" ? (
      <Flex align="center" style={{ width: "100%" }}>
        <div style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden" }}>
          {bc}
        </div>
        <div style={{ flexShrink: 0 }}>{renderNavButtons()}</div>
      </Flex>
    ) : (
      <Flex align="center" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden" }}>
          {bc}
        </div>
        <div style={{ flexShrink: 0 }}>{renderNavButtons()}</div>
      </Flex>
    );
  },
);
