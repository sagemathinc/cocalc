/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare var DEBUG: boolean;

import type { TreeDataNode } from "antd";
import { Input, Modal, Tree } from "antd";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import { toggleChat } from "@cocalc/frontend/chat/chat-indicator";
import { getSideChatActions } from "@cocalc/frontend/frame-editors/generic/chat";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { RenderFrameTree } from "./render-frame-tree";
import type { AppPageAction, FrameInfo } from "./build-tree";
import {
  useActiveFrameData,
  useEnhancedNavigationTreeData,
} from "./use-navigation-data";
import { focusFrameWithRetry } from "./util";

// Extended TreeDataNode with navigation data
export interface NavigationTreeNode extends TreeDataNode {
  key: string;
  title: React.ReactNode;
  children?: NavigationTreeNode[];
  defaultExpanded?: boolean; // Always expand this node by default
  navigationData?: {
    type:
      | "frame"
      | "file"
      | "page"
      | "account"
      | "bookmarked-project"
      | "app-page";
    id?: string;
    projectId?: string;
    filePath?: string;
    shortcutNumber?: number; // 1-9 for frame shortcuts
    searchText?: string;
    appPageAction?: AppPageAction;
    editorType?: string;
    action: () => Promise<void>; // Focus/navigate action
  };
  // Frame tree visualization (for current file node)
  frameTreeStructure?: any;
  activeFrames?: FrameInfo[];
  activeProjectId?: string;
}

interface QuickNavigationDialogProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Extract plain text from a title that might be JSX
 * Used for search matching and comparison
 */
function extractTextFromTitle(title: React.ReactNode): string {
  if (typeof title === "string") {
    return title;
  }
  if (typeof title === "number") {
    return String(title);
  }
  if (React.isValidElement(title)) {
    // For span/div elements, concatenate children text
    const props = title.props as Record<string, unknown>;
    if (Array.isArray(props.children)) {
      return (props.children as React.ReactNode[])
        .map((child: React.ReactNode) => extractTextFromTitle(child))
        .join("");
    }
    if (props.children != null) {
      return extractTextFromTitle(props.children as React.ReactNode);
    }
  }
  return "";
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Determine if search should be case-sensitive based on presence of uppercase
 */
function isCaseSensitive(searchValue: string): boolean {
  return /[A-Z]/.test(searchValue);
}

/**
 * Check if text matches all search terms (partial matching)
 * All terms must appear in the text (case sensitivity based on searchValue)
 */
function matchesAllTerms(text: string, searchValue: string): boolean {
  const terms = searchValue.split(/\s+/).filter((t) => t.length > 0);
  const caseSensitive = isCaseSensitive(searchValue);

  return terms.every((term) => {
    const regex = new RegExp(escapeRegex(term), caseSensitive ? "" : "i");
    return regex.test(text);
  });
}

/**
 * Highlight all occurrences of search terms in text
 *
 * Logic:
 * - Split searchValue by spaces to get individual terms
 * - For each term, find all non-overlapping occurrences in text
 * - Wrap matches in <strong> tags
 * - Case sensitivity determined by presence of uppercase in searchValue
 *
 * Example:
 * - text: "/path/to/foo_file_bar.py"
 * - searchValue: "foo bar"
 * - output: <>/path/to/<strong>foo</strong>_file_<strong>bar</strong>.py</>
 */
function highlightSearchMatches(
  text: string,
  searchValue: string,
): React.ReactNode {
  if (!searchValue.trim()) {
    return text;
  }

  const terms = searchValue.split(/\s+/).filter((t) => t.length > 0);
  const caseSensitive = isCaseSensitive(searchValue);

  // Create regex that matches any of the terms
  const pattern = terms.map((term) => escapeRegex(term)).join("|");
  const regex = new RegExp(`(${pattern})`, caseSensitive ? "g" : "gi");

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, idx) => {
        // Check if this part is one of our search terms (it will match the regex)
        const isMatch =
          part &&
          new RegExp(`^(${pattern})$`, caseSensitive ? "" : "i").test(part);
        return isMatch ? (
          <strong key={idx}>{part}</strong>
        ) : (
          <span key={idx}>{part}</span>
        );
      })}
    </>
  );
}

/**
 * Quick Navigation Dialog - Allows keyboard-based navigation to any frame/page
 *
 * Interaction modes:
 * 1. Number shortcuts (1-9) - Jump to current editor frames
 * 2. Search - Type to filter all content
 * 3. Arrow navigation - Up/Down to navigate filtered results, Return to open
 *
 * Features:
 * - First match auto-selected when searching
 * - Visual highlight (outline + ">") for selected item
 * - Design system colors for consistency
 * - Keyboard-only interaction (no mouse required)
 */
const EXPANDED_KEYS_STORAGE_KEY = "hotkey-nav-expanded";

/**
 * Get all expandable node keys (parent nodes with children) from the tree
 */
function getExpandableNodeKeys(nodes: NavigationTreeNode[]): Set<React.Key> {
  const keys = new Set<React.Key>();
  const traverse = (nodeList: NavigationTreeNode[]) => {
    nodeList.forEach((node) => {
      // Only include nodes that have children (can be expanded)
      if (node.children && node.children.length > 0) {
        keys.add(node.key);
        traverse(node.children);
      }
    });
  };
  traverse(nodes);
  return keys;
}

/**
 * Load persisted expanded keys from localStorage via wrapper functions
 * Filters to only include expandable nodes that are still in the tree
 */
function loadExpandedKeys(treeData: NavigationTreeNode[]): React.Key[] {
  // Start with nodes marked as defaultExpanded
  const defaultExpandedKeys: React.Key[] = [];
  const traverseForDefaults = (nodes: NavigationTreeNode[]) => {
    nodes.forEach((node) => {
      if (node.defaultExpanded) {
        defaultExpandedKeys.push(node.key);
      }
      if (node.children) {
        traverseForDefaults(node.children);
      }
    });
  };
  traverseForDefaults(treeData);

  try {
    const stored = get_local_storage(EXPANDED_KEYS_STORAGE_KEY);
    let keys: React.Key[] = [];

    if (stored && typeof stored === "string") {
      keys = JSON.parse(stored);
    } else if (Array.isArray(stored)) {
      keys = stored;
    }

    // Merge stored keys with default expanded keys
    const mergedKeys = [...new Set([...defaultExpandedKeys, ...keys])];

    // Validate that keys are still expandable in the tree
    if (mergedKeys.length > 0) {
      const expandableKeys = getExpandableNodeKeys(treeData);
      return mergedKeys.filter((key) => expandableKeys.has(key));
    }
  } catch {
    // Ignore errors reading localStorage
  }
  return defaultExpandedKeys;
}

/**
 * Save expanded keys to localStorage via wrapper functions
 * Only stores expandable (parent) nodes that are currently expanded
 */
function saveExpandedKeys(
  keys: React.Key[],
  treeData: NavigationTreeNode[],
): void {
  try {
    const expandableKeys = getExpandableNodeKeys(treeData);
    // Only save keys that are actually expandable
    const filteredKeys = keys.filter((key) => expandableKeys.has(key));
    set_local_storage(EXPANDED_KEYS_STORAGE_KEY, JSON.stringify(filteredKeys));
  } catch {
    // Ignore errors writing to localStorage
  }
}

export const QuickNavigationDialog: React.FC<QuickNavigationDialogProps> = ({
  visible,
  onClose,
}) => {
  const intl = useIntl();
  // Compute navigation tree data only when dialog is visible
  // Pass skip=!visible to skip computation when dialog is closed
  const treeData = useEnhancedNavigationTreeData(!visible);
  const { frameTreeStructure, activeFrames, activeFileName, activeProjectId } =
    useActiveFrameData(!visible);
  // Get open_files state to check chat state
  const open_files = useTypedRedux(
    { project_id: activeProjectId ?? "" },
    "open_files",
  );
  const searchInputRef = useRef<any>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const [searchValue, setSearchValue] = useState("");
  const [expandedKeys, setExpandedKeysState] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState(false);
  const [selectedKey, setSelectedKey] = useState<React.Key | null>(null);

  // Update expanded keys WITHOUT persisting to localStorage (for search auto-expand)
  const setExpandedKeysTransient = (
    keys: React.Key[] | ((prev: React.Key[]) => React.Key[]),
  ) => {
    setExpandedKeysState((prev) => {
      const newKeys = typeof keys === "function" ? keys(prev) : keys;
      return newKeys;
    });
  };

  // Wrapper for setExpandedKeys that persists to localStorage (for user explicit expand/collapse)
  const setExpandedKeys = (
    keys: React.Key[] | ((prev: React.Key[]) => React.Key[]),
  ) => {
    setExpandedKeysState((prev) => {
      const newKeys = typeof keys === "function" ? keys(prev) : keys;
      saveExpandedKeys(newKeys, treeData);
      return newKeys;
    });
  };

  // Focus the search input and clear search when the dialog opens
  useEffect(() => {
    if (visible) {
      // Clear search text and reset state
      setSearchValue("");
      // Load persisted expanded keys instead of resetting to ["current"]
      const persistedKeys = loadExpandedKeys(treeData);
      setExpandedKeysState(persistedKeys);
      setAutoExpandParent(false);
      setSelectedKey(null);

      if (searchInputRef.current) {
        // Use a small timeout to ensure the modal is fully rendered
        const timer = setTimeout(() => {
          // Access the native input element from Ant Design's Input component
          searchInputRef.current?.input?.focus();
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [visible, treeData]);

  // Scroll selected tree node into view when selection changes via keyboard
  useEffect(() => {
    if (selectedKey && treeContainerRef.current) {
      // Use setTimeout to ensure the DOM has been updated after React render
      const timer = setTimeout(() => {
        // Find the selected node using the .ant-tree-node-selected class
        // This is the class added by Ant Design when a node is selected
        const selectedNode = treeContainerRef.current?.querySelector(
          ".ant-tree-node-content-wrapper.ant-tree-node-selected",
        );

        if (selectedNode) {
          // Scroll this node into view
          selectedNode.scrollIntoView({
            behavior: "instant",
            block: "nearest", // scroll minimally - show just the node if possible
          });
        }
      }, 0);

      return () => clearTimeout(timer);
    }
  }, [selectedKey]);

  /**
   * Check if a node is a leaf (has no children or empty children)
   */
  const isLeafNode = (node: NavigationTreeNode): boolean => {
    return !node.children || node.children.length === 0;
  };

  // Flatten tree for search matching - only include leaf nodes
  const searchList = useMemo(() => {
    const list: {
      key: React.Key;
      title: string;
      searchableText: string;
      node: NavigationTreeNode;
    }[] = [];

    const traverse = (nodes: NavigationTreeNode[]) => {
      nodes.forEach((node) => {
        // Only include leaf nodes in search
        if (isLeafNode(node)) {
          // Extract text from title (handle JSX, strings, etc.)
          const titleText = extractTextFromTitle(node.title);
          const extraText = node.navigationData?.searchText ?? "";
          const searchableText = `${titleText} ${extraText}`.trim();
          list.push({ key: node.key, title: titleText, searchableText, node });
        }
        if (node.children) {
          traverse(node.children);
        }
      });
    };

    traverse(treeData);
    return list;
  }, [treeData]);

  // Filter searchList based on current search value
  const filteredSearchList = useMemo(() => {
    if (!searchValue) {
      return searchList;
    }
    return searchList.filter((item) =>
      matchesAllTerms(item.searchableText, searchValue),
    );
  }, [searchList, searchValue]);

  const triggerAction = async (action?: () => Promise<void>) => {
    if (!action) return;
    await action();
  };

  // Build a map of frame IDs to shortcut numbers
  // Chat frames get number 0, other frames get 1-9
  const frameShortcutMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!activeFrames || activeFrames.length === 0) {
      return map;
    }

    let shortcutNumber = 1;
    for (const frame of activeFrames) {
      // Chat frames get number 0
      if (frame.editorType === "chat") {
        map.set(frame.id, 0);
        continue;
      }
      // Other frames get 1-9
      if (shortcutNumber <= 9) {
        map.set(frame.id, shortcutNumber);
        shortcutNumber++;
      }
    }
    return map;
  }, [activeFrames]);

  // Handle frame click from visual frame tree or keyboard shortcuts
  const handleFrameClick = async (frameId: string) => {
    // First, find the frame in searchList (for frames from project files in tree view)
    const frameItem = searchList.find(
      (item) =>
        item.node.navigationData?.type === "frame" &&
        item.node.navigationData?.id === frameId,
    );

    if (frameItem?.node.navigationData) {
      await triggerAction(frameItem.node.navigationData.action);
      onClose();
      return;
    }

    // If not found in searchList, check activeFrames (current editor frames)
    // These are frames from the currently active editor
    if (activeFrames && activeFileName && activeProjectId) {
      const activeFrame = activeFrames.find((f) => f.id === frameId);
      if (activeFrame) {
        // Focus the frame using retry logic (same as in useEnhancedNavigationTreeData)
        setTimeout(
          () =>
            focusFrameWithRetry(activeProjectId, activeFileName, frameId, 0, {
              editorType: activeFrame.editorType,
            }),
          0,
        );
        onClose();
        return;
      }
    }
  };

  // Find parent key for search expansion
  const getParentKey = (key: React.Key): React.Key | null => {
    for (const node of treeData) {
      const found = findInTree(key, node);
      if (found) return found;
    }
    return null;
  };

  const findInTree = (
    key: React.Key,
    node: NavigationTreeNode,
  ): React.Key | null => {
    if (node.children?.some((item) => item.key === key)) {
      return node.key;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = findInTree(key, child);
        if (found) return found;
      }
    }
    return null;
  };

  // Search handler
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    setSearchValue(value);

    if (!value) {
      // No search - restore persisted expanded keys
      const persistedKeys = loadExpandedKeys(treeData);
      setExpandedKeysState(persistedKeys);
      setAutoExpandParent(false);
      setSelectedKey(null);
      return;
    }

    // Expand all parent nodes of matching items, preserving previously expanded keys
    const newExpandedKeys = new Set<React.Key>(expandedKeys);

    // Add all parent keys for matching items
    searchList.forEach((item) => {
      if (matchesAllTerms(item.searchableText, value)) {
        // Add the item itself (so parent expands to show it)
        const parentKey = getParentKey(item.key);
        if (parentKey !== null) {
          newExpandedKeys.add(parentKey);
        }
        // Also add the item if it's a container
        newExpandedKeys.add(item.key);
      }
    });

    // Use transient update (don't persist to localStorage during search)
    setExpandedKeysTransient([...newExpandedKeys]);
    setAutoExpandParent(true);

    // Auto-select first match
    const firstMatch = searchList.find((item) =>
      matchesAllTerms(item.searchableText, value),
    );
    if (firstMatch) {
      setSelectedKey(firstMatch.key);
    }
  };

  // Filter tree to show only matching items (removes non-matching branches)
  const filterTree = (nodes: NavigationTreeNode[]): NavigationTreeNode[] => {
    if (!searchValue) {
      return nodes;
    }

    const filtered = nodes
      .map((node): NavigationTreeNode | null => {
        const titleText = extractTextFromTitle(node.title);
        const searchTarget = `${titleText} ${
          node.navigationData?.searchText ?? ""
        }`;

        // Only leaf nodes can match the search; container nodes are never matched directly
        const isLeaf = !node.children || node.children.length === 0;
        const matches = isLeaf
          ? matchesAllTerms(searchTarget, searchValue)
          : false;

        // Recursively filter children
        const filteredChildren = node.children ? filterTree(node.children) : [];

        // Include node if it matches the search OR has at least one matching descendant
        if (matches || filteredChildren.length > 0) {
          return {
            ...node,
            children:
              filteredChildren.length > 0 ? filteredChildren : node.children,
          };
        }

        return null;
      })
      .filter((node): node is NavigationTreeNode => node !== null);

    return filtered;
  };

  const focusChatInputWithRetry = (
    projectId: string,
    filePath: string,
    attempt: number = 0,
    keepActiveFrame: boolean = false,
  ): void => {
    const chatActions = getSideChatActions({
      project_id: projectId,
      path: filePath,
    });
    chatActions?.focusInput({ keepActiveFrame });
    if (attempt < 5) {
      setTimeout(
        () =>
          focusChatInputWithRetry(
            projectId,
            filePath,
            attempt + 1,
            keepActiveFrame,
          ),
        80,
      );
    }
  };

  // Keyboard handler - handle number shortcuts and navigation
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    // Number shortcuts (0-9) - always available to jump to frames
    const num = parseInt(e.key, 10);
    if (!isNaN(num) && num >= 0 && num <= 9) {
      // Special handling for chat frame (key 0) - toggle chat
      if (num === 0) {
        if (activeFileName && activeProjectId) {
          // Check if chat is already open for this file
          const fileInfo = open_files?.get(activeFileName);
          const chatState = fileInfo?.get("chatState");
          const isChatOpen = !!chatState; // truthy chatState means chat is open

          if (DEBUG) {
            console.log("Chat toggle key 0 pressed:", {
              activeFileName,
              activeProjectId,
              fileInfo: fileInfo?.toJS?.() || fileInfo,
              chatState,
              isChatOpen,
            });
          }

          // Toggle chat using shared function
          toggleChat(activeProjectId, activeFileName, chatState, "hotkey-0");

          onClose();
          e.preventDefault();
          return;
        }
        return;
      }

      // Find frame by shortcut number from the map
      let targetFrameId: string | undefined;
      for (const [frameId, shortcutNum] of frameShortcutMap) {
        if (shortcutNum === num) {
          targetFrameId = frameId;
          break;
        }
      }

      if (targetFrameId) {
        await handleFrameClick(targetFrameId);
        e.preventDefault();
        return;
      }
    }

    // Arrow keys and Return - navigate through filtered leaf nodes only
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!searchValue || filteredSearchList.length === 0) {
        return;
      }
      // filteredSearchList contains only leaf nodes matching the search (if any)
      const currentIndex = filteredSearchList.findIndex(
        (item) => item.key === selectedKey,
      );
      const direction = e.key === "ArrowUp" ? -1 : 1;
      const listLength = filteredSearchList.length;
      let nextIndex: number;

      if (currentIndex === -1) {
        // No selection yet – jump to start/end depending on direction
        nextIndex = direction === -1 ? listLength - 1 : 0;
      } else {
        nextIndex = (currentIndex + direction + listLength) % listLength;
      }

      if (filteredSearchList[nextIndex]) {
        const nextKey = filteredSearchList[nextIndex].key;
        setSelectedKey(nextKey);

        // Auto-expand parent nodes to make selected node visible
        const parentKey = getParentKey(nextKey);
        if (parentKey !== null) {
          // Use transient update (don't persist during keyboard navigation)
          setExpandedKeysTransient((prev) => {
            const newKeys = new Set(prev);
            newKeys.add(parentKey);
            return Array.from(newKeys);
          });
        }
      }
      e.preventDefault();
    } else if (e.key === "Enter") {
      // Activate selected node
      const node = filteredSearchList.find((item) => item.key === selectedKey);
      if (node?.node.navigationData) {
        await triggerAction(node.node.navigationData.action);
        onClose();
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      onClose();
      e.preventDefault();
    }
  };

  // Transform tree data to add visual highlighting and apply filtering
  const transformedTreeData = useMemo(() => {
    // First, filter the tree to show only matching items
    const filteredData = filterTree(treeData);

    // Then, transform for visual highlighting
    const transform = (nodes: NavigationTreeNode[]): NavigationTreeNode[] => {
      return nodes.map((node) => {
        const titleText = extractTextFromTitle(node.title);
        const isLeaf = !node.children || node.children.length === 0;

        let title = node.title;

        // Apply search term highlighting only to leaf nodes (files, not container labels)
        if (searchValue && titleText.length > 0 && isLeaf) {
          const highlighted = highlightSearchMatches(titleText, searchValue);
          // Preserve tree-node-ellipsis styling when wrapping highlighted content
          const hasEllipsisClass =
            React.isValidElement(node.title) &&
            typeof node.title.props === "object" &&
            node.title.props !== null &&
            "className" in node.title.props &&
            typeof node.title.props.className === "string" &&
            node.title.props.className.includes("tree-node-ellipsis");

          if (hasEllipsisClass) {
            // Preserve the ellipsis class with highlighted content
            title = (
              <span className="tree-node-ellipsis" title={titleText}>
                {highlighted}
              </span>
            );
          } else {
            title = <span>{highlighted}</span>;
          }
        }

        // Note: Selection styling is handled by CSS in _hotkey.sass via .ant-tree-node-selected class
        // Ant Design's Tree component applies this class when node key is in selectedKeys prop

        return {
          ...node,
          title,
          children: node.children ? transform(node.children) : undefined,
        };
      });
    };

    return transform(filteredData);
  }, [treeData, selectedKey, searchValue]);

  return (
    <Modal
      title={
        <>
          <Icon name="flash" />{" "}
          {intl.formatMessage({
            id: "app.hotkey.dialog.title",
            defaultMessage: "Quick Navigation",
            description:
              "Title of the quick navigation dialog opened by hotkey",
          })}
        </>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={600}
      maskClosable={true}
      zIndex={10000}
      transitionName=""
      maskTransitionName=""
      styles={{
        body: {
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          height: "max(300px, 70vh)",
          width: "100%",
          boxSizing: "border-box",
          overflow: "hidden",
        },
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
          minWidth: 0,
        }}
      >
        {/* Frame tree visualization (above search box) */}
        {frameTreeStructure && (
          <RenderFrameTree
            structure={frameTreeStructure}
            onFrameClick={handleFrameClick}
            frameShortcutMap={frameShortcutMap}
          />
        )}

        {/* Search input */}
        <Input.Search
          ref={searchInputRef}
          placeholder={intl.formatMessage({
            id: "app.hotkey.dialog.search_placeholder",
            defaultMessage: "Search files and pages...",
            description:
              "Placeholder text for the search input in quick navigation",
          })}
          onChange={handleSearch}
          value={searchValue}
          autoFocus
          allowClear
          style={{ marginBottom: 16 }}
        />

        <div
          ref={treeContainerRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            minWidth: 0,
          }}
          className="quick-nav-tree"
        >
          <Tree
            treeData={transformedTreeData}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onExpand={setExpandedKeys}
            selectedKeys={selectedKey ? [selectedKey] : []}
            showLine={true}
            showIcon={true}
            blockNode={true}
            onSelect={async (keys, info) => {
              const newKey = keys[0] || null;

              // Search in transformedTreeData (full tree with parents) to check if leaf
              const findNode = (
                nodes: NavigationTreeNode[],
              ): NavigationTreeNode | undefined => {
                for (const node of nodes) {
                  if (node.key === newKey) return node;
                  if (node.children) {
                    const found = findNode(node.children);
                    if (found) return found;
                  }
                }
                return undefined;
              };

              const treeNode = findNode(transformedTreeData);

              // Check if this is a leaf node (no children)
              const isLeaf =
                !treeNode?.children || treeNode.children.length === 0;

              // Only allow selection and interaction for leaf nodes
              if (!isLeaf) {
                // Parent nodes expand/collapse but are not selected
                // Reset selection to previous state if clicking a parent
                setSelectedKey(null);

                // Toggle expand/collapse for parent node when clicked
                if (info.event && newKey) {
                  const isCurrentlyExpanded = expandedKeys.includes(newKey);
                  if (isCurrentlyExpanded) {
                    // Collapse: remove from expandedKeys
                    setExpandedKeys(
                      expandedKeys.filter((key) => key !== newKey),
                    );
                  } else {
                    // Expand: add to expandedKeys
                    setExpandedKeys([...expandedKeys, newKey]);
                  }
                }

                return;
              }

              // For leaf nodes: update selection and trigger action on click
              setSelectedKey(newKey);

              // If selected via mouse click on a leaf node, activate it immediately
              // The info.event object is only present when user clicks
              if (info.event) {
                // Use filteredSearchList (same source as Return key handler)
                // This ensures navigationData is properly populated
                const listNode = filteredSearchList.find(
                  (item) => item.key === newKey,
                );
                if (listNode?.node.navigationData) {
                  await triggerAction(listNode.node.navigationData.action);
                  onClose();
                }
              }
            }}
          />
        </div>

        <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          <FormattedMessage
            id="app.hotkey.dialog.help_text"
            defaultMessage="Click frames above • Key 0 toggles chat • Keys 1–9 focus frames • Type to search • ↑↓ navigate • Return to open • ESC to close"
            description="Help text showing keyboard shortcuts in the quick navigation dialog"
          />
        </Paragraph>
      </div>
    </Modal>
  );
};
