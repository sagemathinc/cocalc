/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { TreeDataNode } from "antd";
import { Input, Modal, Tree } from "antd";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon, Paragraph } from "@cocalc/frontend/components";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";

// Extended TreeDataNode with navigation data
export interface NavigationTreeNode extends TreeDataNode {
  key: string;
  title: React.ReactNode;
  children?: NavigationTreeNode[];
  defaultExpanded?: boolean; // Always expand this node by default
  navigationData?: {
    type: "frame" | "file" | "page" | "account" | "bookmarked-project";
    id?: string;
    projectId?: string;
    filePath?: string;
    shortcutNumber?: number; // 1-9 for frame shortcuts
    searchText?: string;
    action: () => void; // Focus/navigate action
  };
}

interface QuickNavigationDialogProps {
  visible: boolean;
  onClose: () => void;
  treeData: NavigationTreeNode[];
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
  treeData,
}) => {
  const intl = useIntl();
  const searchInputRef = useRef<any>(null);
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

  const triggerAction = (action?: () => void) => {
    if (!action) return;
    setTimeout(() => {
      action();
    }, 0);
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
        const matches = matchesAllTerms(searchTarget, searchValue);
        const isParent = node.children && node.children.length > 0;

        // Recursively filter children
        const filteredChildren = node.children ? filterTree(node.children) : [];

        // Include node if:
        // 1. It matches the search, OR
        // 2. It has matching children (parent containers should always show if they have matches)
        if (matches || filteredChildren.length > 0) {
          return {
            ...node,
            children:
              filteredChildren.length > 0 ? filteredChildren : node.children,
          };
        }

        // Keep parent nodes even if they don't match, to preserve tree structure
        // (they will be filtered out by children anyway if children don't match)
        if (isParent) {
          return {
            ...node,
            children: filteredChildren.length > 0 ? filteredChildren : [],
          };
        }

        return null;
      })
      .filter((node): node is NavigationTreeNode => node !== null);

    return filtered;
  };

  // Keyboard handler - handle number shortcuts and navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Number shortcuts (1-9) - only in non-search mode
    if (!searchValue) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const frameNode = searchList.find(
          (item) => item.node.navigationData?.shortcutNumber === num,
        );
        if (frameNode?.node.navigationData) {
          triggerAction(frameNode.node.navigationData.action);
          onClose();
          e.preventDefault();
          return;
        }
      }
    }

    // Arrow keys and Return - navigate through filtered leaf nodes only
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // filteredSearchList contains only leaf nodes matching the search (if any)
      const currentIndex = filteredSearchList.findIndex(
        (item) => item.key === selectedKey,
      );
      let nextIndex = currentIndex;

      if (e.key === "ArrowUp") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else {
        nextIndex = Math.min(filteredSearchList.length - 1, currentIndex + 1);
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
        triggerAction(node.node.navigationData.action);
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
        const isSelected = node.key === selectedKey;
        const titleText = extractTextFromTitle(node.title);
        const isLeaf = !node.children || node.children.length === 0;

        let title = node.title;

        // Apply search term highlighting only to leaf nodes (files, not container labels)
        if (searchValue && titleText.length > 0 && isLeaf) {
          const highlighted = highlightSearchMatches(titleText, searchValue);
          title = <span>{highlighted}</span>;
        }

        // Apply selection styling with pale blue background (not bold to preserve search highlighting)
        if (isSelected) {
          title = (
            <span
              style={{
                backgroundColor: "rgba(13, 110, 253, 0.15)",
                padding: "0 2px",
                borderRadius: "2px",
              }}
            >
              {title}
            </span>
          );
        }

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
          height: "80vh",
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
        <Input.Search
          ref={searchInputRef}
          placeholder={intl.formatMessage({
            id: "app.hotkey.dialog.search_placeholder",
            defaultMessage: "Search frames, files, and pages...",
            description:
              "Placeholder text for the search input in quick navigation",
          })}
          onChange={handleSearch}
          value={searchValue}
          autoFocus
          onKeyDown={handleKeyDown}
          allowClear
          style={{ marginBottom: 16 }}
        />

        <div
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
            minWidth: 0,
            // Suppress Ant Design Tree's default selection styling (border/background)
            // We only use bold text for selection
          }}
          className="quick-nav-tree"
        >
          <style>{`
            .quick-nav-tree .ant-tree-node-selected {
              background-color: transparent !important;
            }
            .quick-nav-tree .ant-tree-node-selected > span[class*="content"] {
              outline: none !important;
            }
          `}</style>
          <Tree
            treeData={transformedTreeData}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            onExpand={setExpandedKeys}
            selectedKeys={selectedKey ? [selectedKey] : []}
            showLine={true}
            showIcon={true}
            blockNode={true}
            onSelect={(keys, info) => {
              const newKey = keys[0] || null;
              const targetNode = searchList.find((item) => item.key === newKey);

              // Check if this is a leaf node (no children)
              const isLeaf =
                !targetNode?.node.children ||
                targetNode.node.children.length === 0;

              // Only select/focus on leaf nodes
              if (isLeaf) {
                setSelectedKey(newKey);
              }

              // If selected via mouse click on a leaf node, activate it immediately
              // The info.event object is only present when user clicks
              if (info.event && newKey && isLeaf) {
                if (targetNode?.node.navigationData) {
                  triggerAction(targetNode.node.navigationData.action);
                  onClose();
                }
              }

              // If it's a parent node (has children), just toggle expansion without selecting
              if (!isLeaf && info.event) {
                // The expand/collapse is handled by Ant Design's Tree component automatically
                // when clicking on the expand icon, so we don't need to do anything here
              }
            }}
          />
        </div>

        <Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          <FormattedMessage
            id="app.hotkey.dialog.help_text"
            defaultMessage="Type to search • Numbers 1–9 for current frames • ↑↓ navigate • Return to open • ESC to close"
            description="Help text showing keyboard shortcuts in the quick navigation dialog"
          />
        </Paragraph>
      </div>
    </Modal>
  );
};
