/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare var DEBUG: boolean;

import { useMemo } from "react";
import { useIntl } from "react-intl";

import {
  redux,
  useActions,
  useTypedRedux,
  useRedux,
} from "@cocalc/frontend/app-framework";
import { useBookmarkedProjects } from "@cocalc/frontend/projects/use-bookmarked-projects";
import {
  path_to_tab,
  trunc_middle,
  unreachable,
  getRandomColor,
} from "@cocalc/util/misc";

import {
  buildNavigationTree,
  PageInfo,
  type AppPageInfo,
  type FileInfo,
  type FrameInfo,
  type FrameTreeStructure,
  type ProjectInfo,
} from "./build-tree";
import type { NavigationTreeNode } from "./dialog";
import { switchAccountPage } from "@cocalc/frontend/account/util";
import { labels } from "@cocalc/frontend/i18n";
import type { EditorSpec } from "@cocalc/frontend/frame-editors/frame-tree/types";
import type { FixedTab } from "@cocalc/frontend/project/page/file-tab";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import {
  ensureFrameFilePath,
  focusFrameWithRetry,
  resolveSpecLabel,
} from "./util";

const PROJECT_PAGE_INFOS: PageInfo[] = Object.entries(FIXED_PROJECT_TABS)
  .filter(([tabId]) => tabId !== "active")
  .map(([tabId, tabConfig]) => {
    const fixedTabId = tabId as FixedTab;
    const label =
      tabConfig && typeof tabConfig.label === "string"
        ? tabConfig.label
        : fixedTabId;
    return {
      id: fixedTabId,
      name: label,
      icon: tabConfig?.icon,
    };
  });

function getEditorSpecFromComponent(component: any): EditorSpec | undefined {
  if (!component) return undefined;
  return component?.editor_spec ?? component?.Editor?.editor_spec;
}

/**
 * Extract frame information from a frame tree structure
 *
 * The frame tree is a binary tree where leaves are editor instances,
 * and internal nodes are split panels. We do a depth-first traversal
 * to get frames in left-to-right order.
 *
 * @param frameTree - The binary frame tree from editor local_view_state
 * @param editor_spec - The editor spec mapping type -> EditorDescription with short names
 * @param includeStructure - If true, return both flat list and tree structure
 */
function extractFramesFromTree(
  frameTree: any,
  editor_spec?: EditorSpec,
): { frames: FrameInfo[]; treeStructure: FrameTreeStructure | null } {
  if (!frameTree) {
    return { frames: [], treeStructure: null };
  }

  const frames: FrameInfo[] = [];
  const traverse = (node: any, depth = 0) => {
    if (!node) {
      return;
    }

    // If this is a leaf node (has type and spec or is a frame type)
    const nodeType = node.get?.("type") ?? node.type;
    const id = node.get?.("id") ?? node.id;

    // Check if this is a leaf editor node (type like "cm", "markdown", etc)
    if (nodeType && nodeType !== "node" && id) {
      // Look up the editor spec for this type to get user-friendly names
      const typeSpec = editor_spec?.[nodeType];
      const specShort = resolveSpecLabel(typeSpec?.short);
      const specName = resolveSpecLabel(typeSpec?.name);
      const shortName = specShort ?? specName ?? nodeType ?? "Unknown";
      const frameName = specName ?? specShort ?? nodeType ?? "Unknown";
      const filePath = node.get?.("path") ?? node.path;

      frames.push({
        id,
        shortName,
        frameName,
        filePath,
        editorType: nodeType,
        color: getRandomColor(nodeType, { min: 80, max: 200, diff: 30 }),
      });
      return;
    }

    // If this is an internal node (has children), traverse left then right
    const first = node.get?.("first");
    const second = node.get?.("second");

    if (first) traverse(first, depth + 1);
    if (second) traverse(second, depth + 1);
  };

  traverse(frameTree);

  // Build the tree structure for rendering
  const buildTreeStructure = (node: any): FrameTreeStructure | null => {
    if (!node) return null;

    const nodeType = node.get?.("type");
    const id = node.get?.("id");

    // Leaf node (editor frame)
    if (nodeType && nodeType !== "node" && id) {
      const frameInfo = frames.find((f) => f.id === id);
      return {
        type: "frame",
        id,
        frame: frameInfo,
      };
    }

    // Internal node (split)
    const direction = node.get?.("direction"); // "col" or "row"
    const first = node.get?.("first");
    const second = node.get?.("second");
    const posRaw = node.get?.("pos");
    const pos = posRaw ? parseFloat(posRaw) : 0.5; // Position 0-1, defaults to 0.5 (50/50)

    return {
      type: "split",
      direction,
      id,
      pos: isNaN(pos) ? 0.5 : pos,
      children: [buildTreeStructure(first), buildTreeStructure(second)].filter(
        (n) => n !== null,
      ),
    };
  };

  const treeStructure = buildTreeStructure(frameTree);

  return { frames, treeStructure };
}

/**
 * Hook that combines Redux state into navigation tree data
 *
 * Handles:
 * - Current editor frames (if in editor mode)
 * - Current project (prioritized)
 * - All other projects
 * - Account pages (hardcoded, always available)
 */
export function useNavigationTreeData(): NavigationTreeNode[] {
  const intl = useIntl();
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  // Get current active tab - when viewing a project, this is the project_id
  const active_top_tab = useTypedRedux("page", "active_top_tab");

  // Only use project_id if we're actually viewing a project (not notifications, file use, etc.)
  // Project IDs are UUIDs, so we can check if it's a valid project_id
  const isProjectView =
    typeof active_top_tab === "string" && active_top_tab.length === 36;
  const project_id: string | undefined = isProjectView
    ? (active_top_tab as string)
    : undefined;

  // Get project data
  const project_map = useTypedRedux("projects", "project_map");
  // Only include projects that are actually open (visible in UI top nav bar)
  const open_projects = useTypedRedux("projects", "open_projects");

  // Get current file/editor state - always call hooks but may return undefined
  // We use a dummy string for project_id when not in project view to avoid conditional hook calls
  const open_files = useTypedRedux(
    { project_id: project_id ?? "" },
    "open_files",
  );
  const open_files_order = useTypedRedux(
    { project_id: project_id ?? "" },
    "open_files_order",
  );
  const starred_files_raw = useTypedRedux(
    { project_id: project_id ?? "" },
    "starred_files",
  );

  // Only use these if we're in a project view
  const starred_files = isProjectView ? starred_files_raw : undefined;

  // Build project info for only open projects
  // TODO (ARIA.md): In the future, also include closed projects with their starred files
  // This would improve navigation for frequently-used files across all projects,
  // following accessibility best practices for quick navigation dialogs
  const projectsData = useMemo(() => {
    // if (DEBUG) {
    //   console.log("useNavigationTreeData - Building projectsData:", {
    //     openProjectsLength: open_projects?.size,
    //     projectMapSize: project_map?.size,
    //     hasProjectMap: !!project_map,
    //     isProjectView,
    //     project_id,
    //   });
    // }
    if (!project_map || !open_projects || open_projects.size === 0) {
      return [];
    }

    return (open_projects.toArray() as string[])
      .map((projectId: string) => {
        const proj = project_map?.get(projectId);
        if (!proj) {
          return null;
        }

        const isCurrentProject = projectId === project_id;

        // Build file list for ALL open projects
        // For the current project, we have data loaded in Redux
        // For other projects, we try to get open_files from their project stores if available
        let files: FileInfo[] = [];

        if (isCurrentProject && open_files && open_files_order) {
          // Current project: use already-loaded editor state
          files = (open_files_order || [])
            .filter((path: string) => !!path)
            .map((path: string) => {
              const fileState = open_files.get(path);
              const frameTree = fileState?.get("frames");
              const component = fileState?.get("component");
              const editorSpec = getEditorSpecFromComponent(component);
              // Truncate long file paths in the middle for display
              const displayName = trunc_middle(path, 50);
              const frameData = frameTree
                ? extractFramesFromTree(frameTree, editorSpec)
                : undefined;
              return {
                path,
                name: displayName,
                frames: frameData
                  ? ensureFrameFilePath(frameData.frames, path)
                  : [],
              };
            })
            .toArray();
        } else if (!isCurrentProject) {
          // Other projects: try to get files from their project stores if loaded
          // Note: This only works if the project store has been accessed
          // For full directory listing, we would need to fetch via conat
          const otherProjectStore = redux.getProjectStore(projectId);
          if (otherProjectStore) {
            const otherOpenFiles = otherProjectStore.get("open_files");
            const otherOpenFilesOrder =
              otherProjectStore.get("open_files_order");
            if (otherOpenFiles && otherOpenFilesOrder) {
              files = (otherOpenFilesOrder || [])
                .filter((path: string) => !!path)
                .map((path: string) => {
                  const fileState = otherOpenFiles.get(path);
                  const frameTree = fileState?.get("frames");
                  const component = fileState?.get("component");
                  const editorSpec = getEditorSpecFromComponent(component);
                  const displayName = trunc_middle(path, 50);
                  const frameData = frameTree
                    ? extractFramesFromTree(frameTree, editorSpec)
                    : undefined;
                  return {
                    path,
                    name: displayName,
                    frames: frameData
                      ? ensureFrameFilePath(frameData.frames, path)
                      : [],
                  };
                })
                .toArray();
            }
          }
        }

        // Get starred files for this project (excluding already-open files)
        let starredFiles: string[] = [];
        const openFilePaths = new Set(files.map((f) => f.path));
        if (isCurrentProject) {
          // Current project: get from Redux state (starred_files is a top-level project store property)
          if (starred_files) {
            const allStarred = Array.isArray(starred_files)
              ? starred_files
              : (starred_files.toArray?.() ?? []);
            starredFiles = allStarred.filter(
              (path) => !openFilePaths.has(path),
            );
          }
        } else {
          // Other projects: get from their project store if available
          const otherProjectStore = redux.getProjectStore(projectId);
          if (otherProjectStore) {
            const otherStarredFiles = otherProjectStore.get("starred_files");
            if (otherStarredFiles) {
              const allStarred = Array.isArray(otherStarredFiles)
                ? otherStarredFiles
                : (otherStarredFiles.toArray?.() ?? []);
              starredFiles = allStarred.filter(
                (path) => !openFilePaths.has(path),
              );
            }
          }
        }

        return {
          id: projectId,
          title: proj.get("title") || projectId,
          files,
          pages: PROJECT_PAGE_INFOS,
          starredFiles,
        } as ProjectInfo;
      })
      .filter((p): p is ProjectInfo => p !== null);
  }, [
    project_map,
    open_projects,
    project_id,
    open_files,
    open_files_order,
    starred_files,
  ]);

  // Get bookmarked projects
  const {
    bookmarkedProjects: bookmarkedProjectIds,
    isInitialized: bookmarksInitialized,
  } = useBookmarkedProjects();

  // Build ProjectInfo for bookmarked projects (excluding open projects)
  const bookmarkedProjectsData = useMemo(() => {
    if (!bookmarksInitialized || !project_map) {
      return [];
    }

    return bookmarkedProjectIds
      .map((projectId) => {
        const proj = project_map?.get(projectId);
        if (!proj) {
          return null;
        }

        // For bookmarked projects, we don't need open files, pages, or starred files
        // (they're not open, so those are unavailable)
        return {
          id: projectId,
          title: proj.get("title") || projectId,
          files: [],
          pages: [],
          starredFiles: [],
        } as ProjectInfo;
      })
      .filter((p): p is ProjectInfo => p !== null);
  }, [bookmarkedProjectIds, project_map, bookmarksInitialized]);

  const appPages: AppPageInfo[] = useMemo(() => {
    const pages: AppPageInfo[] = [];

    const projectsLabel = intl.formatMessage(labels.projects);
    pages.push({
      id: "projects",
      name: projectsLabel,
      icon: "edit",
      action: "tab",
      searchText: `${projectsLabel} projects list`,
    });

    if (is_logged_in && !is_anonymous) {
      const messagesTitle = intl.formatMessage(labels.messages_title);
      pages.push({
        id: "notifications",
        name: messagesTitle,
        icon: "mail",
        action: "tab",
        searchText: `${messagesTitle} ${intl.formatMessage(labels.messages)}`,
      });

      const fileUseLabel = intl.formatMessage(labels.file_use_notifications);
      pages.push({
        id: "file-use",
        name: fileUseLabel,
        icon: "bell",
        action: "toggle-file-use",
        searchText: `${fileUseLabel} bell dropdown`,
      });
    }

    return pages;
  }, [intl, is_logged_in, is_anonymous]);

  // Build the complete navigation tree
  const treeData = useMemo(() => {
    const currentProject =
      projectsData.find((p) => p.id === project_id) || null;
    const otherProjects = projectsData.filter((p) => p.id !== project_id);

    return buildNavigationTree(
      currentProject,
      otherProjects,
      bookmarkedProjectsData,
      appPages,
      intl,
    );
  }, [projectsData, project_id, bookmarkedProjectsData, appPages, intl]);

  return treeData;
}

/**
 * Hook that returns just the frame tree structure and active frames
 * (without the full tree data)
 */
export function useActiveFrameData(): {
  frameTreeStructure: FrameTreeStructure | null;
  activeFrames: FrameInfo[];
  activeFileName?: string;
  activeProjectId?: string;
} {
  // Re-use the logic from useNavigationTreeData to get frames
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const isProjectView =
    typeof active_top_tab === "string" && active_top_tab.length === 36;
  const project_id: string | undefined = isProjectView
    ? (active_top_tab as string)
    : undefined;

  const open_files = useTypedRedux(
    { project_id: project_id ?? "" },
    "open_files",
  );
  const open_files_order = useTypedRedux(
    { project_id: project_id ?? "" },
    "open_files_order",
  );
  const active_project_tab_raw = useTypedRedux(
    { project_id: project_id ?? "" },
    "active_project_tab",
  );

  const active_project_tab = isProjectView ? active_project_tab_raw : undefined;

  const activeEditorContext: {
    activeFileName?: string;
    editorReduxName?: string;
    editorSpec?: EditorSpec;
  } = useMemo(() => {
    if (
      !isProjectView ||
      !active_project_tab ||
      !active_project_tab.startsWith("editor-") ||
      !open_files_order
    ) {
      return {};
    }

    const activeFile = open_files_order.find((path: string) => {
      return !!(path && path_to_tab(path) === active_project_tab);
    });
    if (!activeFile) {
      return {};
    }

    const fileState = open_files?.get(activeFile);
    if (!fileState) {
      return {};
    }

    const component = fileState?.get("component");
    const editorReduxName =
      component?.get?.("redux_name") ?? component?.redux_name;
    const editorSpec = getEditorSpecFromComponent(component);

    return {
      activeFileName: activeFile,
      editorReduxName,
      editorSpec,
    };
  }, [isProjectView, active_project_tab, open_files, open_files_order]);

  const frameTreePath = useMemo<string[]>(() => {
    return [
      activeEditorContext.editorReduxName ?? "",
      "local_view_state",
      "frame_tree",
    ];
  }, [activeEditorContext.editorReduxName]);

  const activeFrameTree = useRedux(frameTreePath);

  const { activeFrames, frameTreeStructure } = useMemo(() => {
    if (!activeEditorContext.activeFileName || !activeFrameTree) {
      return {
        activeFrames: [],
        frameTreeStructure: null,
      };
    }

    const result = extractFramesFromTree(
      activeFrameTree,
      activeEditorContext.editorSpec,
    );

    const normalizedFrames = ensureFrameFilePath(
      result.frames,
      activeEditorContext.activeFileName,
    );

    const updateStructureFrames = (node: FrameTreeStructure | null) => {
      if (!node) return;
      if (node.type === "frame" && node.frame) {
        const match = normalizedFrames.find((f) => f.id === node.frame?.id);
        if (match) {
          node.frame = match;
        }
        return;
      }
      node.children?.forEach((child) => updateStructureFrames(child));
    };
    updateStructureFrames(result.treeStructure);

    return {
      activeFrames: normalizedFrames,
      frameTreeStructure: result.treeStructure,
    };
  }, [
    activeFrameTree,
    activeEditorContext.activeFileName,
    activeEditorContext.editorSpec,
  ]);

  const activeProjectId = isProjectView ? project_id : undefined;

  return {
    frameTreeStructure,
    activeFrames,
    activeFileName: activeEditorContext.activeFileName,
    activeProjectId,
  };
}

/**
 * Hook that adds action handlers to tree nodes
 * Ties navigation to Redux actions and routing
 */
export function useEnhancedNavigationTreeData(): NavigationTreeNode[] {
  const treeData = useNavigationTreeData();
  const active_top_tab = useTypedRedux("page", "active_top_tab");

  // Get project_id from active_top_tab (same logic as useNavigationTreeData)
  const project_id =
    typeof active_top_tab === "string" && active_top_tab.length === 36
      ? active_top_tab
      : undefined;

  const page_actions = useActions("page");

  // Enhance tree nodes with action handlers
  const enhancedTreeData = useMemo(() => {
    const enhanceNode = (node: NavigationTreeNode): NavigationTreeNode => {
      if (node.navigationData) {
        const navData = node.navigationData;

        switch (navData.type) {
          case "frame":
            // Focus a frame within an editor
            // If the file is not open, open_file handles project switching automatically
            navData.action = async () => {
              if (!navData.id || !navData.projectId || !navData.filePath) {
                if (DEBUG) {
                  console.log("Frame action missing required fields", {
                    frameId: navData.id,
                    projectId: navData.projectId,
                    filePath: navData.filePath,
                  });
                }
                return;
              }

              const {
                id: frameId,
                projectId: targetProjectId,
                filePath,
                editorType,
              } = navData;

              // Ensure the file is open (handles project switching if needed)
              const projectActions = redux.getProjectActions(targetProjectId);
              if (projectActions) {
                await projectActions.open_file({ path: filePath });
              }

              // Focus the frame after the file is open
              focusFrameWithRetry(targetProjectId, filePath, frameId, 0, {
                editorType,
              });
            };
            break;

          case "page":
            // Switch to project page (fixed tab)
            navData.action = async () => {
              if (navData.id && navData.projectId) {
                // If switching to a different project, activate it first
                if (navData.projectId !== project_id) {
                  page_actions?.set_active_tab(navData.projectId);
                }
                // Then switch to the desired tab within the project
                const projectActions = redux.getProjectActions(
                  navData.projectId,
                );
                if (projectActions) {
                  projectActions.set_active_tab(navData.id);
                }
              }
            };
            break;

          case "file":
            // Open file in editor
            // open_file automatically handles switching to the project and setting active tab
            navData.action = async () => {
              if (navData.id && navData.projectId) {
                const projectActions = redux.getProjectActions(
                  navData.projectId,
                );
                if (projectActions) {
                  await projectActions.open_file({ path: navData.id });
                }
              }
            };
            break;

          case "account":
            // Navigate to account page via Redux actions (mirrors account-page.tsx structure)
            navData.action = async () => {
              if (navData.id) {
                // First, navigate to the account page (top-level tab)
                page_actions?.set_active_tab("account");
                // Then use the shared helper to handle the specific account page/sub-tab
                switchAccountPage(navData.id, redux.getActions("account"));
              }
            };
            break;

          case "bookmarked-project":
            // Open a bookmarked project (not currently open)
            navData.action = async () => {
              if (navData.projectId) {
                const projectsActions = redux.getActions("projects");
                projectsActions.open_project({
                  project_id: navData.projectId,
                  switch_to: true,
                });
              }
            };
            break;

          case "app-page":
            navData.action = async () => {
              if (!navData.id || !navData.appPageAction) {
                return;
              }

              switch (navData.appPageAction) {
                case "tab":
                  page_actions?.set_active_tab(navData.id);
                  break;
                case "toggle-file-use": {
                  const showFileUse = redux
                    .getStore("page")
                    ?.get("show_file_use");
                  if (!showFileUse) {
                    page_actions?.toggle_show_file_use();
                  }
                  break;
                }
                default:
                  unreachable(navData.appPageAction);
              }
            };
            break;

          default:
            unreachable(navData.type);
        }
      }

      // Recursively enhance children
      if (node.children) {
        node.children = node.children.map(enhanceNode);
      }

      return node;
    };

    return treeData.map(enhanceNode);
  }, [treeData, project_id, page_actions]);

  return enhancedTreeData;
}
