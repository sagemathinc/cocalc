/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IntlShape } from "react-intl";

import {
  ACCOUNT_MAIN_MENU_ITEMS,
  PREFERENCES_SUB_TABS,
} from "@cocalc/frontend/account/account-preferences-config";
import { Icon, IconName } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import type { IntlMessage } from "@cocalc/frontend/i18n";
import { isIntlMessage, labels } from "@cocalc/frontend/i18n";
import type { FixedTab } from "@cocalc/frontend/project/page/file-tab";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import { COLORS } from "@cocalc/util/theme";
import type { NavigationTreeNode } from "./dialog";

/**
 * Frame information from active editor
 */
export interface FrameInfo {
  id: string;
  shortName: string;
  frameName: string | IntlMessage; // Full name (e.g., "Jupyter Notebook")
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

export type AppPageAction = "tab" | "toggle-file-use";

/**
 * Application-level page (e.g., Projects list, Notifications panel)
 */
export interface AppPageInfo {
  id: string;
  name: string;
  icon?: IconName;
  searchText?: string;
  action: AppPageAction;
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
 * Frame tree structure for visual rendering (separate from tree nodes)
 * Exported for use in dialog component
 */
export interface FrameTreeStructure {
  type: "frame" | "split";
  frame?: FrameInfo;
  direction?: "row" | "col";
  children?: FrameTreeStructure[];
  id?: string;
  pos?: number;
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
  currentProject: ProjectInfo | null,
  allProjects: ProjectInfo[],
  bookmarkedProjects: ProjectInfo[],
  appPages: AppPageInfo[],
  intl: IntlShape,
): NavigationTreeNode[] {
  const tree: NavigationTreeNode[] = [];

  // 2. Current project (prioritized if in a project)
  if (currentProject) {
    tree.push(buildProjectNode(currentProject, intl));
  }

  // 3. Other projects
  allProjects
    .filter((p) => p.id !== currentProject?.id)
    .forEach((project) => {
      tree.push(buildProjectNode(project, intl));
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
          action: async () => {
            // Will be set by caller with actual actions
          },
        },
      }));

    tree.push({
      key: "bookmarked-projects",
      title: (
        <>
          <Icon name="star-filled" style={{ color: COLORS.STAR }} />{" "}
          {intl ? intl.formatMessage(labels.projects) : "Projects"}
        </>
      ),
      children: bookmarkedChildren,
    });
  }

  // 5. Account pages (with nested structure matching account page left navigation)
  if (ACCOUNT_MAIN_MENU_ITEMS.length > 0) {
    const accountChildren: NavigationTreeNode[] = [];

    // Generate main menu items from config
    ACCOUNT_MAIN_MENU_ITEMS.forEach((item) => {
      const itemLabel = intl.formatMessage(item.label);
      accountChildren.push({
        key: item.key,
        title: (
          <>
            <Icon name={item.icon as IconName} /> {itemLabel}
          </>
        ),
        navigationData: {
          type: "account",
          id: item.id,
          searchText: itemLabel,
          action: async () => {},
        },
      });
    });

    // Insert Preferences (nested submenu) after Profile
    const preferencesChildren: NavigationTreeNode[] = PREFERENCES_SUB_TABS.map(
      (tab) => {
        const tabLabel = intl.formatMessage(tab.label);
        return {
          key: tab.key,
          title: tab.useAIAvatar ? (
            <>
              <AIAvatar size={16} style={{ top: "-5px" }} /> {tabLabel}
            </>
          ) : (
            <>
              <Icon name={tab.icon as IconName} /> {tabLabel}
            </>
          ),
          navigationData: {
            type: "account",
            id: tab.id,
            searchText: tabLabel,
            action: async () => {},
          },
        };
      },
    );

    // Insert Preferences after Profile (at index 2: after Settings and Profile)
    accountChildren.splice(2, 0, {
      key: "account-preferences",
      title: (
        <>
          <Icon name="sliders" /> {intl.formatMessage(labels.preferences)}
        </>
      ),
      children: preferencesChildren,
    });

    tree.push({
      key: "account",
      title: intl.formatMessage(labels.account),
      children: accountChildren,
    });
  }

  // 6. Application-level pages (Projects page, notifications, etc.)
  if (appPages?.length) {
    const appPageChildren: NavigationTreeNode[] = appPages.map((page) => ({
      key: `app-page-${page.id}`,
      title: page.name,
      icon: page.icon ? <Icon name={page.icon} /> : undefined,
      navigationData: {
        type: "app-page",
        id: page.id,
        searchText: page.searchText ?? page.name,
        appPageAction: page.action,
        action: async () => {
          // Will be connected to Redux actions by caller
        },
      },
    }));

    tree.push({
      key: "app-pages",
      title: intl.formatMessage(labels.pages),
      children: appPageChildren,
    });
  }

  return tree;
}

/**
 * Build a project node with files, frames, and pages
 * Structure: Project -> [Files, Pages] -> [files, pages]
 * (Prioritization is handled by insertion order in buildNavigationTree)
 */
function buildProjectNode(
  project: ProjectInfo,
  intl: IntlShape,
): NavigationTreeNode {
  const children: NavigationTreeNode[] = [];

  // 1. Files section with nested file list
  if (project.files.length > 0) {
    const fileChildren: NavigationTreeNode[] = [];

    project.files.forEach((file) => {
      const fileIcon = filenameIcon(file.path);
      const fileNode: NavigationTreeNode = {
        key: `file-${project.id}-${file.path}`,
        title: (
          <span className="tree-node-ellipsis" title={file.path}>
            {file.name}
          </span>
        ),
        icon: <Icon name={fileIcon} />,
        navigationData: {
          type: "file",
          id: file.path,
          projectId: project.id,
          filePath: file.path,
          searchText: file.path,
          action: async () => {
            // Will be set by caller with actual actions
          },
        },
        children: file.frames.map((frame) => ({
          key: `file-frame-${project.id}-${file.path}-${frame.id}`,
          title: frame.shortName,
          navigationData: {
            type: "frame",
            id: frame.id,
            projectId: project.id,
            filePath: file.path,
            searchText: buildFrameSearchText(frame, file.path),
            editorType: frame.editorType,
            action: async () => {
              // Will be set by caller with actual actions
            },
          },
        })),
      };
      fileChildren.push(fileNode);
    });

    children.push({
      key: `project-${project.id}-files`,
      title: intl.formatMessage(labels.files),
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
          key: `starred-file-${project.id}-${filePath}`,
          title: (
            <span className="tree-node-ellipsis" title={filePath}>
              {fileName}
            </span>
          ),
          icon: <Icon name={fileIcon} />,
          navigationData: {
            type: "file",
            id: filePath,
            projectId: project.id,
            filePath,
            searchText: filePath,
            action: async () => {
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

      // Get translated page label
      let pageName = page.name;
      if (pageTab?.label) {
        if (isIntlMessage(pageTab.label)) {
          pageName = intl.formatMessage(pageTab.label);
        } else if (typeof pageTab.label === "string") {
          pageName = pageTab.label;
        }
      }

      // Build search text with translated labels
      let searchText = pageName;
      if (page.id === "files") {
        // For Files page, also include "Explorer" translation
        const explorerLabel = intl.formatMessage(labels.explorer);
        searchText = `${pageName} ${explorerLabel}`;
      }

      pageChildren.push({
        key: `page-${project.id}-${page.id}`,
        title: pageName,
        icon: <Icon name={pageIcon} />,
        navigationData: {
          type: "page",
          id: page.id,
          projectId: project.id,
          searchText,
          action: async () => {
            // Will be set by caller with actual actions
          },
        },
      });
    });

    children.push({
      key: `project-${project.id}-pages`,
      title: intl.formatMessage(labels.pages),
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
