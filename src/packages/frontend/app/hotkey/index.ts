/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export {
  buildNavigationTree,
  flattenTreeForSearch,
  type AccountPageInfo,
  type FileInfo,
  type FrameInfo,
  type NavigationItem,
  type PageInfo,
  type ProjectInfo,
} from "./build-tree";
export { GlobalHotkeyDetector, useShiftShiftDetector } from "./detector";
export { QuickNavigationDialog } from "./dialog";
export type { NavigationTreeNode } from "./dialog";
export {
  useEnhancedNavigationTreeData,
  useNavigationTreeData,
} from "./use-navigation-data";
