/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// TabsContainer — renders a type:"tabs" node in the frame tree using
// Ant Design Tabs.  All children are always mounted (keeping their DOM
// alive); inactive tabs are hidden with display:none so that state like
// CodeMirror scroll positions is preserved across tab switches.

import React, { useCallback, useContext, useMemo, useRef } from "react";
import { useDraggable, useDroppable, useDndContext } from "@dnd-kit/core";
import { ConfigProvider, Dropdown, Tabs } from "antd";
import type { MenuProps } from "antd";
import type { Map } from "immutable";
import type { List } from "immutable";
import { Icon } from "@cocalc/frontend/components/icon";
import type { IconName } from "@cocalc/frontend/components/icon";
import { useRedux } from "@cocalc/frontend/app-framework";
import { isIntlMessage } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { path_split } from "@cocalc/util/misc";
import type { EditorSpec, NodeDesc } from "./types";
import { FRAME_TAB_BAR_STYLE, buildSwitchToFileItems } from "./style";
import type { Rendered } from "@cocalc/frontend/app-framework";
import type { FrameDragData } from "./dnd/frame-dnd-provider";
import { FrameDndZoneContext } from "./dnd/frame-dnd-provider";
import { has_id } from "./tree-ops";

/** Context telling child frames they are inside a tab container. */
export const TabContainerContext = React.createContext<{
  tabContainerId: string | null;
  tabSiblingCount: number;
}>({ tabContainerId: null, tabSiblingCount: 0 });

/**
 * DraggableTabLabel — wraps each tab's label to make it a drag source
 * AND a drop target for sibling tab reordering.
 *
 * Drag source: emits FrameDragData (same as title-bar drag handle).
 * Drop target: accepts sibling tabs for reorder, or external frames
 * to add to this tab container.
 */
function DraggableTabLabel({
  frameId,
  frameType,
  label,
  iconName,
  tabsId,
  childIds,
  onClose,
}: {
  frameId: string;
  frameType: string;
  label: string;
  iconName: IconName;
  tabsId: string;
  childIds: string[];
  onClose: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `tab-drag-${frameId}`,
    data: {
      type: "frame-drag",
      frameId,
      frameType,
      frameLabel: label,
    } satisfies FrameDragData,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tab-reorder-${frameId}`,
    data: {
      type: "tab-reorder-drop",
      tabsId,
      frameId,
      childIds,
    },
  });

  // Check if the active drag is a sibling tab in the same container
  const { active } = useDndContext();
  const isSiblingDrag =
    active?.data?.current?.type === "frame-drag" &&
    childIds.includes(active.data.current.frameId) &&
    active.data.current.frameId !== frameId;
  const showGap = isOver && isSiblingDrag;

  // Measure the DRAGGED tab's width (not the hovered tab, to avoid a
  // feedback loop where marginLeft inflates our own .ant-tabs-tab).
  const sourceTabWidthRef = useRef(0);
  if (showGap && active) {
    // Find the dragged tab's DOM node via its droppable sibling ID
    const sourceFrameId = active.data.current?.frameId;
    if (sourceFrameId && sourceTabWidthRef.current === 0) {
      const sourceEl = document.querySelector(
        `[data-frame-tab-id="${sourceFrameId}"]`,
      );
      const sourceTab = sourceEl?.closest(".ant-tabs-tab") as HTMLElement;
      if (sourceTab) {
        sourceTabWidthRef.current = sourceTab.offsetWidth;
      }
    }
  } else {
    sourceTabWidthRef.current = 0;
  }
  const gapWidth = showGap ? sourceTabWidthRef.current || 60 : 0;

  // Drag ref stays on the label span; drop ref expands to the full
  // .ant-tabs-tab wrapper so the entire tab pill is a valid drop target
  // (not just the inner label text).
  const combinedRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      const tabEl = el?.closest(".ant-tabs-tab") as HTMLElement | null;
      setDropRef(tabEl ?? el);
    },
    [setDragRef, setDropRef],
  );

  return (
    <span
      ref={combinedRef}
      data-frame-tab-id={frameId}
      {...listeners}
      {...attributes}
      style={{
        display: "inline-flex",
        alignItems: "center",
        maxWidth: 150,
        cursor: isDragging ? "grabbing" : "grab",
        opacity: isDragging ? 0.5 : 1,
        marginLeft: gapWidth,
        transition: "margin-left 0.15s ease",
        gap: 4,
      }}
    >
      <Icon name={iconName} style={{ flexShrink: 0 }} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "1";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = "0.5";
        }}
        style={{
          flexShrink: 0,
          fontSize: 10,
          opacity: 0.5,
          cursor: "pointer",
        }}
      >
        <Icon name="times" />
      </span>
    </span>
  );
}

interface Props {
  frame_tree: Map<string, any>;
  actions: any; // CodeEditorActions
  // render_one: the function from FrameTree that renders a single frame node
  renderChild: (child: NodeDesc) => Rendered;
  // editor_spec: map from type to spec (for labels/icons)
  editor_spec: EditorSpec;
  // Currently focused frame ID — used to sync activeTab when focus changes
  // programmatically (e.g. close_frame, DnD operations).
  active_id?: string;
}

export function TabsContainer({
  frame_tree,
  actions,
  renderChild,
  editor_spec,
  active_id,
}: Props) {
  const children = frame_tree.get("children");
  const storedActiveTab = frame_tree.get("activeTab", 0);
  const tabsId = frame_tree.get("id") as string;

  // Derive activeTab: if active_id points to a child of this tab container
  // (or a descendant of one), prefer that over the stored activeTab.
  // This keeps the visible tab in sync after programmatic focus changes
  // (e.g. close_frame, DnD operations) that only update active_id.
  const activeTab = useMemo(() => {
    if (!active_id || !children) return storedActiveTab;
    const idx = children.findIndex((child: Map<string, any>) =>
      child.get("id") === active_id || has_id(child, active_id),
    );
    return idx >= 0 ? idx : storedActiveTab;
  }, [active_id, children, storedActiveTab]);

  // For multi-file editors (e.g. LaTeX), get the list of switchable files
  const switchToFiles: List<string> | undefined = useRedux([
    actions.name,
    "switch_to_files",
  ]);

  const handleTabChange = useCallback(
    (key: string) => {
      const idx = parseInt(key, 10);
      if (!isNaN(idx)) {
        actions.set_frame_tree({ id: tabsId, activeTab: idx });
        const child = children?.get(idx);
        if (child) {
          const childId = child.get("id");
          if (childId) {
            actions.set_active_id(childId, true);
          }
        }
      }
    },
    [actions, tabsId, children],
  );

  // Child IDs for the tab-bar drop target (so the provider can check
  // whether the dragged frame is already in this container)
  const childIds = useMemo(
    () =>
      children
        ?.map((c: Map<string, any>) => c.get("id") as string)
        .toArray() ?? [],
    [children],
  );

  const items = useMemo(() => {
    if (!children) return [];
    return children
      .map((child: Map<string, any>, i: number) => {
        const type = child.get("type");
        const frameId = child.get("id") as string;
        const spec = editor_spec?.[type];
        const rawLabel = spec?.short ?? spec?.name ?? type;
        const childPath: string | undefined = child.get("path");
        const label = childPath
          ? (path_split(childPath).tail || type)
          : type === "node"
            ? "Split"
            : isIntlMessage(rawLabel)
              ? rawLabel.defaultMessage
              : rawLabel;
        const iconName: IconName =
          type === "node" ? "column-width" : (spec?.icon ?? "file");
        return {
          key: String(i),
          label: (
            <DraggableTabLabel
              frameId={frameId}
              frameType={type}
              label={label}
              iconName={iconName}
              tabsId={tabsId}
              childIds={childIds}
              onClose={() => actions.close_frame(frameId)}
            />
          ),
          children: null, // We render content below, not inside Tabs
        };
      })
      .toArray();
  }, [children, editor_spec, tabsId, childIds]);

  // Build the "add tab" dropdown menu: files first, then frame types
  const addTabMenu = useMemo((): MenuProps => {
    const menuItems: MenuProps["items"] = [];

    // Switchable files first (e.g. LaTeX included files)
    if (switchToFiles && switchToFiles.size > 0) {
      const fileItems = buildSwitchToFileItems(
        switchToFiles.toJS(),
        actions.path,
        undefined,
        (path) => actions.add_tab(tabsId, "cm", path),
      );
      menuItems.push(...fileItems);
      menuItems.push({ type: "divider", key: "div-files" });
    }

    // Frame types from editor_spec
    for (const type in editor_spec) {
      const spec = editor_spec[type];
      if (!spec) continue;
      const rawLabel = spec.short ?? spec.name ?? type;
      const label = isIntlMessage(rawLabel)
        ? rawLabel.defaultMessage
        : rawLabel;
      menuItems.push({
        key: `type-${type}`,
        icon: <Icon name={spec.icon ?? "file"} />,
        label,
        onClick: () => actions.add_tab(tabsId, type),
      });
    }

    return { items: menuItems };
  }, [editor_spec, switchToFiles, tabsId, actions]);

  // Tab bar drop target: frames dragged onto the tab bar get added as tabs
  const { setNodeRef: setTabBarDropRef, isOver: isTabBarOver } = useDroppable({
    id: `tab-bar-drop-${tabsId}`,
    data: {
      type: "tab-bar-drop",
      tabsId,
      childIds,
      frameLabel: "Tabs",
    },
  });

  // Report "tab" zone when dragging over the tab bar
  const { active } = useDndContext();
  const isDragActive = active?.data?.current?.type === "frame-drag";
  const { setDropZone } = useContext(FrameDndZoneContext);
  const isTabBarHighlighted = isTabBarOver && isDragActive;

  // Report zone to provider when hovering the tab bar
  React.useEffect(() => {
    if (isTabBarHighlighted) {
      setDropZone(tabsId, "tab");
    } else {
      setDropZone(tabsId, null);
    }
  }, [isTabBarHighlighted, tabsId, setDropZone]);

  const tabContainerValue = useMemo(
    () => ({
      tabContainerId: tabsId,
      tabSiblingCount: children?.size ?? 0,
    }),
    [tabsId, children?.size],
  );

  if (!children || children.size === 0) {
    return null;
  }

  return (
    <TabContainerContext.Provider value={tabContainerValue}>
      <div
        className="smc-vfill"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <div
          ref={setTabBarDropRef}
          style={{
            flexShrink: 0,
            ...(isTabBarHighlighted
              ? {
                  outline: `2px solid ${COLORS.BLUE_D}`,
                  outlineOffset: -2,
                  background: "rgba(24, 144, 255, 0.08)",
                }
              : undefined),
          }}
        >
          <ConfigProvider
            theme={{
              components: {
                Tabs: {
                  cardBg: COLORS.GRAY_LL,
                },
              },
            }}
          >
            <Tabs
              activeKey={String(activeTab)}
              onChange={handleTabChange}
              items={items}
              size="small"
              style={{
                marginBottom: 0,
                flexShrink: 0,
              }}
              type="card"
              tabBarStyle={FRAME_TAB_BAR_STYLE}
              tabBarExtraContent={{
                right: (
                  <Dropdown menu={addTabMenu} trigger={["click"]}>
                    <Icon
                      name="down-circle-o"
                      style={{
                        cursor: "pointer",
                        padding: "4px 8px",
                        fontSize: 12,
                      }}
                    />
                  </Dropdown>
                ),
              }}
            />
          </ConfigProvider>
        </div>
        {children.map((child: Map<string, any>, i: number) => (
          <div
            key={child.get("id")}
            className="smc-vfill"
            style={{
              flex: 1,
              overflow: "hidden",
              display: i === activeTab ? undefined : "none",
            }}
          >
            {renderChild(child)}
          </div>
        ))}
      </div>
    </TabContainerContext.Provider>
  );
}
