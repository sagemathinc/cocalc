/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare var DEBUG: boolean;

import { useMemo } from "react";

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
  type AccountPageInfo,
  type FileInfo,
  type FrameInfo,
  type ProjectInfo,
} from "./build-tree";
import type { NavigationTreeNode } from "./dialog";

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
function extractFramesFromTree(frameTree: any, editor_spec?: any): FrameInfo[];
function extractFramesFromTree(
  frameTree: any,
  editor_spec: any,
  includeStructure: true,
): { frames: FrameInfo[]; treeStructure: any };
function extractFramesFromTree(
  frameTree: any,
  editor_spec?: any,
  includeStructure: boolean = false,
): FrameInfo[] | { frames: FrameInfo[]; treeStructure: any } {
  if (!frameTree) {
    const result = { frames: [], treeStructure: null };
    return includeStructure ? result : result.frames;
  }

  const frames: FrameInfo[] = [];
  let frameIndex = 0;

  const traverse = (node: any) => {
    if (!node) return;

    // If this is a leaf node (has type and spec or is a frame type)
    const nodeType = node.get?.("type");
    const id = node.get?.("id");

    // Check if this is a leaf editor node (type like "cm", "markdown", etc)
    if (nodeType && nodeType !== "node" && id) {
      // Look up the editor spec for this type to get user-friendly names
      const typeSpec = editor_spec?.[nodeType];
      const shortName =
        typeSpec?.short || typeSpec?.name || nodeType || "Unknown";
      const frameName = typeSpec?.name || nodeType || "Unknown";

      frames.push({
        id,
        shortName,
        frameName,
        filePath: typeSpec?.path,
        editorType: nodeType,
        color: getRandomColor(nodeType),
      });
      frameIndex++;
      return;
    }

    // If this is an internal node (has children), traverse left then right
    const first = node.get?.("first");
    const second = node.get?.("second");

    if (first) traverse(first);
    if (second) traverse(second);
  };

  traverse(frameTree);

  // If structure is not requested, return just the flat list
  if (!includeStructure) {
    return frames;
  }

  // Build the tree structure for rendering
  const buildTreeStructure = (node: any): any => {
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

    return {
      type: "split",
      direction,
      id,
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
  const active_project_tab_raw = useTypedRedux(
    { project_id: project_id ?? "" },
    "active_project_tab",
  );
  const starred_files_raw = useTypedRedux(
    { project_id: project_id ?? "" },
    "starred_files",
  );

  // Only use these if we're in a project view
  const active_project_tab = isProjectView ? active_project_tab_raw : undefined;
  const starred_files = isProjectView ? starred_files_raw : undefined;

  interface ActiveEditorContext {
    activeFileName?: string;
    editorReduxName?: string;
    editor_spec?: any;
  }

  const activeEditorContext: ActiveEditorContext = useMemo(() => {
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
    const editorReduxName = component?.redux_name;

    return {
      activeFileName: activeFile,
      editorReduxName,
      editor_spec: component?.editor_spec,
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

    const extractResult = extractFramesFromTree(
      activeFrameTree,
      activeEditorContext.editor_spec,
      true,
    );
    const result =
      extractResult && "frames" in extractResult
        ? (extractResult as { frames: FrameInfo[]; treeStructure: any })
        : { frames: extractResult as FrameInfo[], treeStructure: null };

    return {
      activeFrames: result.frames,
      frameTreeStructure: result.treeStructure,
    };
  }, [
    activeFrameTree,
    activeEditorContext.activeFileName,
    activeEditorContext.editor_spec,
  ]);

  const activeFileName = activeEditorContext.activeFileName;

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
              // Truncate long file paths in the middle for display
              const displayName = trunc_middle(path, 50);
              return {
                path,
                name: displayName,
                frames: frameTree ? extractFramesFromTree(frameTree) : [],
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
                  const displayName = trunc_middle(path, 50);
                  return {
                    path,
                    name: displayName,
                    frames: frameTree ? extractFramesFromTree(frameTree) : [],
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

        // Project pages (fixed tabs) - use actual FixedTab types from ProjectActions
        const pages: PageInfo[] = [
          { id: "files", name: "Files", icon: "folder" },
          { id: "new", name: "New", icon: "plus" },
          { id: "search", name: "Search", icon: "search" },
          { id: "log", name: "Recent Files", icon: "history" },
          { id: "settings", name: "Settings", icon: "gear" },
          { id: "info", name: "Info", icon: "microchip" },
          { id: "users", name: "Users", icon: "users" },
          { id: "servers", name: "Servers", icon: "server" },
          { id: "upgrades", name: "Upgrades", icon: "gift" },
        ];

        return {
          id: projectId,
          title: proj.get("title") || projectId,
          files,
          pages,
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
        // Get starred files for bookmarked project
        let starredFiles: string[] = [];
        const projectStore = redux.getProjectStore(projectId);
        if (projectStore) {
          const starredFilesList = projectStore.get("starred_files");
          if (starredFilesList && starredFilesList.toArray) {
            starredFiles = starredFilesList.toArray();
          }
        }

        // For bookmarked projects, we don't need open files or pages, just basic info and starred files
        return {
          id: projectId,
          title: proj.get("title") || projectId,
          files: [],
          pages: [],
          starredFiles,
        } as ProjectInfo;
      })
      .filter((p): p is ProjectInfo => p !== null);
  }, [bookmarkedProjectIds, project_map, bookmarksInitialized]);

  // Account pages - mirrors the account page left navigation structure
  // These are not used directly; they're just for documentation
  // The actual account section is built in buildNavigationTree() instead
  const accountPages: AccountPageInfo[] = useMemo(
    () => [
      { id: "index", name: "Settings" },
      { id: "profile", name: "Profile" },
      // Preferences (nested)
      { id: "preferences-appearance", name: "Appearance" },
      { id: "preferences-editor", name: "Editor" },
      { id: "preferences-keyboard", name: "Keyboard" },
      { id: "preferences-ai", name: "AI" },
      { id: "preferences-communication", name: "Communication" },
      { id: "preferences-keys", name: "SSH and API Keys" },
      { id: "preferences-other", name: "Other" },
      // Subscriptions & Purchases
      { id: "subscriptions", name: "Subscriptions" },
      { id: "licenses", name: "Licenses" },
      { id: "payg", name: "Pay as you Go" },
      { id: "upgrades", name: "Upgrades" },
      { id: "purchases", name: "Purchases" },
      { id: "payments", name: "Payments" },
      { id: "payment-methods", name: "Payment Methods" },
      { id: "statements", name: "Statements" },
      // Other
      { id: "cloud-filesystems", name: "Cloud Filesystems" },
      { id: "public-paths", name: "Public Paths" },
      { id: "support", name: "Support" },
    ],
    [],
  );

  // Build the complete navigation tree
  const treeData = useMemo(() => {
    // if (DEBUG) {
    //   console.log("useNavigationTreeData - Building tree:", {
    //     activeFrames,
    //     projectsDataLength: projectsData.length,
    //     project_id,
    //     accountPagesLength: accountPages.length,
    //     bookmarkedProjectsDataLength: bookmarkedProjectsData.length,
    //     isProjectView,
    //   });
    // }
    const currentProject =
      projectsData.find((p) => p.id === project_id) || null;
    const otherProjects = projectsData.filter((p) => p.id !== project_id);

    return buildNavigationTree(
      activeFrames,
      currentProject,
      otherProjects,
      accountPages,
      bookmarkedProjectsData,
      activeFileName,
      frameTreeStructure,
      project_id,
    );
  }, [
    activeFrames,
    activeFileName,
    frameTreeStructure,
    projectsData,
    project_id,
    accountPages,
    bookmarkedProjectsData,
  ]);

  return treeData;
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

  const focusFrameWithRetry = (
    targetProjectId: string,
    editorPath: string,
    frameId: string,
    attempt: number = 0,
  ): void => {
    const editorActions = redux.getEditorActions(targetProjectId, editorPath);
    if (editorActions) {
      editorActions.set_active_id(frameId, false);
      return;
    }
    if (attempt < 15) {
      setTimeout(
        () =>
          focusFrameWithRetry(
            targetProjectId,
            editorPath,
            frameId,
            attempt + 1,
          ),
        100,
      );
    } else if (DEBUG) {
      console.log("Unable to focus frame (editor actions missing)", {
        targetProjectId,
        editorPath,
        frameId,
      });
    }
  };

  // Enhance tree nodes with action handlers
  const enhancedTreeData = useMemo(() => {
    const enhanceNode = (node: NavigationTreeNode): NavigationTreeNode => {
      if (node.navigationData) {
        const navData = node.navigationData;

        switch (navData.type) {
          case "frame":
            navData.action = () => {
              if (!navData.id) {
                if (DEBUG) {
                  console.log("Frame action missing frameId");
                }
                return;
              }
              const frameId = navData.id;

              const targetProjectId = navData.projectId ?? project_id;
              if (!targetProjectId) {
                if (DEBUG) {
                  console.log("Frame action missing projectId", {
                    navProjectId: navData.projectId,
                    fallbackProjectId: project_id,
                  });
                }
                return;
              }

              if (targetProjectId !== project_id) {
                page_actions?.set_active_tab(targetProjectId);
              }

              const projectStore = redux.getProjectStore(targetProjectId);
              const activeProjectTab = projectStore?.get("active_project_tab");
              const currentEditorPath =
                typeof activeProjectTab === "string" &&
                activeProjectTab.startsWith("editor-")
                  ? activeProjectTab.slice("editor-".length)
                  : undefined;

              const needsFileSwitch =
                navData.filePath != null &&
                navData.filePath.length > 0 &&
                navData.filePath !== currentEditorPath;
              if (needsFileSwitch && navData.filePath) {
                const projectActions = redux.getProjectActions(targetProjectId);
                projectActions?.open_file({ path: navData.filePath });
              }

              const editorPath = navData.filePath ?? currentEditorPath;
              if (!editorPath) {
                if (DEBUG) {
                  console.log(
                    "Unable to determine editorPath for frame action",
                    {
                      targetProjectId,
                      currentEditorPath,
                      navData,
                    },
                  );
                }
                return;
              }

              setTimeout(
                () => focusFrameWithRetry(targetProjectId, editorPath, frameId),
                0,
              );
            };
            break;

          case "page":
            // Switch to project page (fixed tab)
            navData.action = () => {
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
            // open_file automatically handles switching to the file tab and setting active project
            navData.action = () => {
              if (navData.id && navData.projectId) {
                const filePath = navData.id;
                const projectId = navData.projectId;

                // If switching to a different project, activate it first
                if (projectId !== project_id) {
                  page_actions?.set_active_tab(projectId);
                }

                // Open the file (automatically sets active tab and project)
                const projectActions = redux.getProjectActions(projectId);
                if (projectActions) {
                  projectActions.open_file({ path: filePath });
                }
              }
            };
            break;

          case "account":
            // Navigate to account page via Redux actions (mirrors account-page.tsx structure)
            navData.action = () => {
              if (navData.id) {
                const accountActions = redux.getActions("account");

                // Handle settings overview (index)
                if (navData.id === "index") {
                  accountActions.set_active_tab("index");
                  accountActions.setState({
                    active_page: "index",
                    active_sub_tab: undefined,
                  });
                  accountActions.push_state(`/settings/index`);
                  return;
                }

                // Handle profile as standalone page
                if (navData.id === "profile") {
                  accountActions.set_active_tab("profile");
                  accountActions.setState({
                    active_page: "profile",
                    active_sub_tab: undefined,
                  });
                  accountActions.push_state(`/profile`);
                  return;
                }

                // Handle preferences sub-tabs
                if (navData.id.startsWith("preferences-")) {
                  const subTab = navData.id.replace("preferences-", "");
                  const subTabKey = `preferences-${subTab}` as any;
                  // Use set_active_tab to ensure proper page navigation
                  accountActions.set_active_tab("preferences");
                  accountActions.setState({
                    active_sub_tab: subTabKey,
                    active_page: "preferences",
                  });
                  accountActions.push_state(`/preferences/${subTab}`);
                  return;
                }

                // Handle all other account pages (subscriptions, licenses, payg, etc.)
                // These use set_active_tab which is the standard account page action
                accountActions.set_active_tab(navData.id);
                accountActions.push_state(`/${navData.id}`);
              }
            };
            break;

          case "bookmarked-project":
            // Open a bookmarked project (not currently open)
            navData.action = () => {
              if (navData.projectId) {
                const projectsActions = redux.getActions("projects");
                projectsActions.open_project({
                  project_id: navData.projectId,
                  switch_to: true,
                });
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
