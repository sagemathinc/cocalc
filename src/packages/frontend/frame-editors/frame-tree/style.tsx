import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "@cocalc/util/theme";
import { path_split } from "@cocalc/util/misc";

export const TITLE_BAR_BORDER = `1px solid var(--cocalc-border-light, ${COLORS.GRAY_DDD})`;

/** Shared tab bar style for Ant Design Tabs used in frame editor panels. */
export const FRAME_TAB_BAR_STYLE: CSSProperties = {
  margin: 0,
  padding: "0 8px",
  borderBottom: TITLE_BAR_BORDER,
  background: `var(--cocalc-bg-elevated, ${COLORS.GRAY_LLLL})`,
} as const;

/**
 * Build menu items for the "switch to file" list used in multi-file editors
 * (e.g. LaTeX with included .tex files).
 *
 * @param files      - sorted list of file paths (from store's switch_to_files)
 * @param mainPath   - the main file path of the editor (actions.path)
 * @param currentPath - the path of the currently focused frame (may differ for subfiles)
 * @param onClick    - callback when a file is selected
 */
export function buildSwitchToFileItems(
  files: string[],
  mainPath: string,
  currentPath: string | undefined,
  onClick: (path: string) => void,
): { key: string; label: ReactNode; onClick: () => void }[] {
  return files.map((filePath) => {
    const filename = path_split(filePath).tail;
    const isMain = filePath === mainPath;
    const isCurrent = filePath === currentPath;
    const label = (
      <>
        {isCurrent ? <b>{filename}</b> : filename}
        {isMain ? " (main)" : ""}
      </>
    );
    return {
      key: filePath,
      label,
      onClick: () => onClick(filePath),
    };
  });
}
