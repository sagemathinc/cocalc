/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tag } from "antd";

import {
  ACCOUNT_MAIN_MENU_ITEMS,
  PREFERENCES_SUB_TABS,
} from "@cocalc/frontend/account/account-preferences-config";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon, IconName } from "@cocalc/frontend/components";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import type { FixedTab } from "@cocalc/frontend/project/page/file-tab";
import { COLORS } from "@cocalc/util/theme";
import { trunc_middle } from "@cocalc/util/misc";
import type { NavigationTreeNode } from "./dialog";

/**
 * Frame information from active editor
 */
export interface FrameInfo {
  id: string;
  shortName: string;
  frameName: string; // Full name (e.g., "Jupyter Notebook")
  filePath?: string; // If frame is for a file
  editorType?: string; // Type of editor (e.g., "cm", "markdown") for coloring
  color?: string; // Color for the tag
}

/**
 * File with its frames
 */
export interface FileInfo {
  path: string;
  name: string;
  frames: FrameInfo[];
}

/**
 * Fixed tab/page in a project (must be a valid FixedTab from ProjectActions)
 */
export interface PageInfo {
  id: FixedTab;
  name: string;
  icon?: IconName;
}

/**
 * Project data
 */
export interface ProjectInfo {
  id: string;
  title: string;
  files: FileInfo[];
  pages: PageInfo[];
  starredFiles?: string[]; // Paths to starred files in this project
}

/**
 * Account page
 */
export interface AccountPageInfo {
  id: string;
  name: string;
  href?: string;
}

function buildFrameSearchText(
  frame: FrameInfo,
  filePath?: string,
): string | undefined {
  const parts = [frame.shortName, frame.frameName, frame.editorType, filePath];
  const text = parts.filter(Boolean).join(" ");
  return text || undefined;
}

/**
 * Build the navigation tree from application state
 *
 * Structure:
 * - [current] - Current editor frames (if editing) with frame tree structure
 * - Project [title] - Current project (prioritized)
 * - Project [title] - Other projects
 * - Projects (bookmarked) - Bookmarked projects not already open
 * - Account - Account pages
 */
export function buildNavigationTree(
  activeFrames: FrameInfo[],
  currentProject: ProjectInfo | null,
  allProjects: ProjectInfo[],
  accountPages: AccountPageInfo[],
  bookmarkedProjects: ProjectInfo[] = [],
  activeFileName?: string,
  frameTreeStructure?: any,
  activeProjectId?: string,
): NavigationTreeNode[] {
  const tree: NavigationTreeNode[] = [];

  // Build a map of frame IDs to their indices for quick lookup
  const frameIndexMap = new Map<string, number>();
  activeFrames.forEach((frame, index) => {
    frameIndexMap.set(frame.id, index + 1);
  });

  /**
   * Recursively build tree nodes from frame tree structure
   * Splits show as "Horizontal" or "Vertical" with frame children
   */
  function buildFrameTreeNodes(
    node: any,
    path: string = "tree",
    projectId?: string,
    filePath?: string,
  ): NavigationTreeNode | null {
    if (!node) return null;

    if (node.type === "frame" && node.frame) {
      const frameIndex = frameIndexMap.get(node.frame.id) ?? 1;
      return {
        key: `frame-${node.frame.id}`,
        title: (
          <span>
            <Tag color={node.frame.color}>{frameIndex}</Tag>{" "}
            {node.frame.shortName}
          </span>
        ),
        navigationData: {
          type: "frame",
          id: node.frame.id,
          projectId,
          filePath,
          shortcutNumber: frameIndex,
          searchText: buildFrameSearchText(node.frame, filePath),
          action: () => {
            // Will be set by caller with actual actions
          },
        },
      };
    }

    if (node.type === "split") {
      const isVertical = node.direction === "row"; // "row" means vertical divider (frames stacked vertically)
      const directionLabel = isVertical ? "Vertical" : "Horizontal";

      return {
        key: `split-${path}`,
        title: directionLabel,
        defaultExpanded: true, // Always expand split nodes to show the frame structure
        children: (node.children || [])
          .map((child: any, i: number) =>
            buildFrameTreeNodes(child, `${path}-${i}`, projectId, filePath),
          )
          .filter((n): n is NavigationTreeNode => n !== null),
      };
    }

    return null;
  }

  // 1. Current file with frames section (if editor is open)
  if (activeFrames.length > 0 && activeFileName) {
    const children: NavigationTreeNode[] = [];

    // If we have a frame tree structure, render it; otherwise show flat list
    if (frameTreeStructure) {
      const structureNode = buildFrameTreeNodes(
        frameTreeStructure,
        "tree",
        activeProjectId ?? currentProject?.id,
        activeFileName,
      );
      if (structureNode) {
        children.push(structureNode);
      }
    } else {
      // Fallback to flat list if no structure is available
      children.push(
        ...activeFrames.map((frame, index) => ({
          key: `frame-${frame.id}`,
          title: (
            <span>
              <Tag color={frame.color}>{index + 1}</Tag> {frame.shortName}
            </span>
          ),
          navigationData: {
            type: "frame" as const,
            id: frame.id,
            projectId: activeProjectId ?? currentProject?.id,
            filePath: activeFileName,
            shortcutNumber: index + 1,
            searchText: buildFrameSearchText(frame, activeFileName),
            action: () => {
              // Will be set by caller with actual actions
            },
          },
        })),
      );
    }

    tree.push({
      key: "current-file",
      title: trunc_middle(activeFileName, 50),
      defaultExpanded: true, // Always expand the current file
      children,
    });
  }

  // 2. Current project (prioritized if in a project)
  if (currentProject) {
    tree.push(buildProjectNode(currentProject));
  }

  // 3. Other projects
  allProjects
    .filter((p) => p.id !== currentProject?.id)
    .forEach((project) => {
      tree.push(buildProjectNode(project));
    });

  // 4. Bookmarked projects (filtered to exclude already open projects)
  const openProjectIds = new Set(allProjects.map((p) => p.id));
  if (currentProject) {
    openProjectIds.add(currentProject.id);
  }
  const bookmarkedProjectsNotOpen = bookmarkedProjects.filter(
    (p) => !openProjectIds.has(p.id),
  );
  if (bookmarkedProjectsNotOpen.length > 0) {
    const bookmarkedChildren: NavigationTreeNode[] =
      bookmarkedProjectsNotOpen.map((project) => ({
        key: `bookmarked-project-${project.id}`,
        title: project.title,
        navigationData: {
          type: "bookmarked-project",
          projectId: project.id,
          searchText: `${project.title} ${project.id}`,
          action: () => {
            // Will be set by caller with actual actions
          },
        },
      }));

    tree.push({
      key: "bookmarked-projects",
      title: (
        <>
          <Icon name="star-filled" style={{ color: COLORS.STAR }} /> Projects
        </>
      ),
      children: bookmarkedChildren,
    });
  }

  // 5. Account pages (with nested structure matching account page left navigation)
  if (accountPages && accountPages.length > 0) {
    const accountChildren: NavigationTreeNode[] = [];

    // Generate main menu items from config
    ACCOUNT_MAIN_MENU_ITEMS.forEach((item) => {
      accountChildren.push({
        key: item.key,
        title: (
          <>
            <Icon name={item.icon as IconName} /> {item.label}
          </>
        ),
        navigationData: {
          type: "account",
          id: item.id,
          searchText: item.label,
          action: () => {},
        },
      });
    });

    // Insert Preferences (nested submenu) after Profile
    const preferencesChildren: NavigationTreeNode[] = PREFERENCES_SUB_TABS.map(
      (tab) => ({
        key: tab.key,
        title: tab.useAIAvatar ? (
          <>
            <AIAvatar size={16} style={{ top: "-5px" }} /> {tab.label}
          </>
        ) : (
          <>
            <Icon name={tab.icon as IconName} /> {tab.label}
          </>
        ),
        navigationData: {
          type: "account",
          id: tab.id,
          searchText: tab.label,
          action: () => {},
        },
      }),
    );

    // Insert Preferences after Profile (at index 2: after Settings and Profile)
    accountChildren.splice(2, 0, {
      key: "account-preferences",
      title: (
        <>
          <Icon name="sliders" /> Preferences
        </>
      ),
      children: preferencesChildren,
    });

    tree.push({
      key: "account",
      title: "Account",
      children: accountChildren,
    });
  }

  return tree;
}

/**
 * Build a project node with files, frames, and pages
 * Structure: Project -> [Files, Pages] -> [files, pages]
 * (Prioritization is handled by insertion order in buildNavigationTree)
 */
function buildProjectNode(project: ProjectInfo): NavigationTreeNode {
  const children: NavigationTreeNode[] = [];

  // 1. Files section with nested file list
  if (project.files.length > 0) {
    const fileChildren: NavigationTreeNode[] = [];

    project.files.forEach((file) => {
      const fileIcon = filenameIcon(file.path);
      const fileNode: NavigationTreeNode = {
        key: `file-${file.path}`,
        title: trunc_middle(file.name, 30),
        icon: <Icon name={fileIcon} />,
        navigationData: {
          type: "file",
          id: file.path,
          projectId: project.id,
          filePath: file.path,
          searchText: file.path,
          action: () => {
            // Will be set by caller with actual actions
          },
        },
        children: file.frames.map((frame) => ({
          key: `file-frame-${file.path}-${frame.id}`,
          title: frame.shortName,
          navigationData: {
            type: "frame",
            id: frame.id,
            projectId: project.id,
            filePath: file.path,
            searchText: buildFrameSearchText(frame, file.path),
            action: () => {
              // Will be set by caller with actual actions
            },
          },
        })),
      };
      fileChildren.push(fileNode);
    });

    children.push({
      key: `project-${project.id}-files`,
      title: "Files",
      icon: <Icon name="folder" />,
      children: fileChildren,
    });
  }

  // 2. Starred files section (if any)
  if (project.starredFiles && project.starredFiles.length > 0) {
    const starredFileChildren: NavigationTreeNode[] = project.starredFiles.map(
      (filePath) => {
        const fileName = filePath.split("/").pop() || filePath;
        const fileIcon = filenameIcon(filePath);
        return {
          key: `starred-file-${filePath}`,
          title: trunc_middle(fileName, 30),
          icon: <Icon name={fileIcon} />,
          navigationData: {
            type: "file",
            id: filePath,
            projectId: project.id,
            filePath,
            searchText: filePath,
            action: () => {
              // Will be set by caller with actual actions
            },
          },
        };
      },
    );

    children.push({
      key: `project-${project.id}-starred-files`,
      title: (
        <>
          <Icon name="star-filled" style={{ color: COLORS.STAR }} /> Files
        </>
      ),
      children: starredFileChildren,
    });
  }

  // 3. Pages section with nested pages list
  if (project.pages.length > 0) {
    const pageChildren: NavigationTreeNode[] = [];

    project.pages.forEach((page) => {
      const pageTab = FIXED_PROJECT_TABS[page.id as FixedTab];
      const pageIcon = pageTab?.icon ?? "question";
      pageChildren.push({
        key: `page-${project.id}-${page.id}`,
        title: page.name,
        icon: <Icon name={pageIcon} />,
        navigationData: {
          type: "page",
          id: page.id,
          projectId: project.id,
          searchText: `${page.name} ${project.title}`,
          action: () => {
            // Will be set by caller with actual actions
          },
        },
      });
    });

    children.push({
      key: `project-${project.id}-pages`,
      title: "Pages",
      icon: <Icon name="list" />,
      children: pageChildren,
    });
  }

  return {
    key: `project-${project.id}`,
    title: `${project.title || project.id}`,
    children,
  };
}

/**
 * Create a flat list of all navigation items with their breadcrumb paths
 * Useful for search and matching
 */
export interface NavigationItem {
  key: string;
  textContent: string;
  breadcrumb: string[];
  node: NavigationTreeNode;
}

export function flattenTreeForSearch(
  tree: NavigationTreeNode[],
): NavigationItem[] {
  const items: NavigationItem[] = [];

  const traverse = (nodes: NavigationTreeNode[], breadcrumb: string[] = []) => {
    nodes.forEach((node) => {
      const nodeTitle =
        typeof node.title === "string" ? node.title : String(node.title);
      const currentBreadcrumb = [...breadcrumb, nodeTitle];

      items.push({
        key: String(node.key),
        textContent: nodeTitle,
        breadcrumb: currentBreadcrumb,
        node,
      });

      if (node.children) {
        traverse(node.children, currentBreadcrumb);
      }
    });
  };

  traverse(tree);
  return items;
}
