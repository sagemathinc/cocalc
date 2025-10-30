/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/**
 * ARIA labels for project page content tabs/panels.
 * Maps tab names to descriptive labels for screen readers.
 * This is a first step to extract tab titles to a central location
 * and avoid duplication with other tab definitions.
 */

export const PROJECT_TAB_ARIA_LABELS: Record<string, string> = {
  home: "Home",
  files: "File Explorer",
  new: "Create New",
  log: "Recent Files",
  search: "Find",
  servers: "Compute Servers",
  settings: "Project Settings",
  info: "Project Information",
  users: "Collaborators",
  upgrades: "Licenses",
  active: "Open Files",
} as const;

/**
 * Get the ARIA label for a project tab by name.
 * For editor tabs (editor-{path}), returns "Editor: {filename}"
 * For fixed tabs, returns the label from PROJECT_TAB_ARIA_LABELS
 * Falls back to "Project Content" if tab name is not recognized
 */
export function getProjectTabAriaLabel(tabName: string): string {
  // Handle editor tabs (editor-{path})
  if (tabName.startsWith("editor-")) {
    const path = tabName.slice("editor-".length);
    return `Editor: ${path}`;
  }

  // Look up fixed tab label
  const label = PROJECT_TAB_ARIA_LABELS[tabName];
  if (label != null) {
    return label;
  }

  // Fallback for unknown tabs
  return "Project Content";
}
