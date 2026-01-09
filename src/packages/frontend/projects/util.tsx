/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { MenuProps } from "antd";
import { Map as immutableMap, Set as immutableSet } from "immutable";
import { useMemo } from "react";
import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName, Tip } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { isIntlMessage } from "@cocalc/frontend/i18n";
import { EventRecordMap } from "@cocalc/frontend/project/history/types";
import {
  SPEC as SERVER_SPEC,
  serverURL,
} from "@cocalc/frontend/project/named-server-panel";
import { getTime } from "@cocalc/frontend/project/page/flyouts/log";
import { useAvailableFeatures } from "@cocalc/frontend/project/use-available-features";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COMPUTE_STATES, ComputeState } from "@cocalc/util/compute-states";
import {
  capitalize,
  cmp,
  cmp_Date,
  parse_hashtags,
  search_match,
  search_split,
  trunc_middle,
  unreachable,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import {
  NAMED_SERVER_NAMES,
  NamedServerName,
} from "@cocalc/util/types/servers";
import { ProjectMap } from "./store";

function parse_tags(info): string[] {
  const indices = parse_hashtags(info);
  return Array.from(new Set(indices.map((i) => info.substring(i[0], i[1]))));
}

function hashtags_to_string(tags: Set<string> | string[] | undefined): string {
  if (tags == null) return "";
  tags = Array.from(tags);
  if (tags.length == 0) return "";
  return "#" + tags.join(" #");
}

let search_cache: {
  [project_id: string]: string;
} = {};
let last_project_map: ProjectMap | null | undefined = null;
let last_user_map: any = null;

function get_search_info(project_id: string, project, user_map): string {
  let s: undefined | string = search_cache[project_id];
  if (s != null) {
    return s;
  }
  s = project.get("title") ?? "";
  if (s == null) throw Error("not possible");
  const desc = project.get("description");
  if (desc != "No description") {
    s += " " + desc;
  }
  const hostName = project.getIn(["host", "name"]);
  if (hostName != null) {
    s += " " + hostName;
  }
  const compute_state: ComputeState =
    COMPUTE_STATES[project.getIn(["state", "state"], "")];
  const display = compute_state?.display;
  s +=
    " " + (isIntlMessage(display) ? display.defaultMessage : (display ?? ""));
  s = s.toLowerCase();
  s = s + " " + hashtags_to_string(parse_tags(s));
  if (user_map != null) {
    project.get("users")?.forEach((_, account_id) => {
      if (account_id == webapp_client.account_id) return;
      const info = user_map.get(account_id);
      if (info != null) {
        s += (
          " " +
          info.get("first_name") +
          " " +
          info.get("last_name") +
          " "
        ).toLowerCase();
      }
    });
  }
  return (search_cache[project_id] = s);
}

export function getVisibleProjects(
  project_map: ProjectMap | undefined,
  user_map,
  hashtags: immutableSet<string> | undefined,
  search: string,
  deleted: boolean,
  hidden: boolean,
  sort_by: "user_last_active" | "last_edited" | "title" | "state",
): string[] {
  const visible_projects: string[] = [];
  if (project_map == null) return visible_projects;
  if (project_map != last_project_map || user_map != last_user_map) {
    search_cache = {};
  }
  last_project_map = project_map;
  last_user_map = user_map;
  const words = search_split(
    search + " " + hashtags_to_string(hashtags?.toJS()),
  );
  project_map.forEach((project, project_id) => {
    if (
      search_match(get_search_info(project_id, project, user_map), words) &&
      project_is_in_filter(project, deleted, hidden)
    ) {
      visible_projects.push(project_id);
    }
  });
  sort_projects(visible_projects, project_map, sort_by);
  return visible_projects;
}

function sort_projects(project_ids: string[], project_map, sort_by): void {
  let f;
  switch (sort_by) {
    case "user_last_active":
      const account_id = webapp_client.account_id;
      f = (p1, p2) => {
        // We compare the last_active time for *us*, then sort the rest by last_edited.
        const a1 = project_map.getIn([p1, "last_active", account_id]);
        const a2 = project_map.getIn([p2, "last_active", account_id]);
        if (a1 != null && a2 != null) {
          return -cmp_Date(a1, a2);
        }
        if (a1 == null && a2 != null) {
          return 1;
        }
        if (a2 == null && a1 != null) {
          return -1;
        }
        return -cmp_Date(
          project_map.getIn([p1, "last_edited"]),
          project_map.getIn([p2, "last_edited"]),
        );
      };
      break;

    case "last_edited":
      f = (p1, p2) => {
        return -cmp_Date(
          project_map.getIn([p1, "last_edited"]),
          project_map.getIn([p2, "last_edited"]),
        );
      };
      break;

    case "title":
      f = (p1, p2) => {
        return cmp(
          project_map.getIn([p1, "title"])?.toLowerCase(),
          project_map.getIn([p2, "title"])?.toLowerCase(),
        );
      };
      break;

    case "state":
      f = (p1, p2) => {
        return cmp(
          project_map.getIn([p1, "state", "state"], "z"),
          project_map.getIn([p2, "state", "state"], "z"),
        );
      };
      break;

    default:
      return;
  }
  project_ids.sort(f);
}

export function get_visible_hashtags(project_map, visible_projects): string[] {
  if (project_map == null) return [];
  const tags = new Set();
  for (const project_id of visible_projects) {
    const project = project_map.get(project_id);
    if (project == null) continue;
    for (const tag of parse_tags(
      (
        project.get("title", "") +
        " " +
        project.get("description", "")
      ).toLowerCase(),
    )) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort() as string[];
}

// Returns true if the project should be visible with the given filters selected
function project_is_in_filter(
  project: immutableMap<string, any>,
  deleted: boolean,
  hidden: boolean,
): boolean {
  const { account_id } = webapp_client;
  if (account_id == null) return true;
  return (
    !!project.get("deleted") == deleted &&
    !!project.getIn(["users", account_id, "hide"]) == hidden
  );
}

/**
 * Blend a base color with a user-selected color to create a subtle hint.
 *
 * @param custom - The color (hex string or undefined) a user selected for the object
 * @param base - The base background color to blend with (i.e. the background, default color)
 * @param brighter - Adjust the opacity, e.g. for even/odd rows
 */
export function blendBackgroundColor(
  custom: string | undefined,
  base: string,
  brighter: boolean = false,
): string {
  if (!custom) {
    return base;
  }

  const opacity = brighter ? 0.09 : 0.05;

  // Uses CSS color-mix() to blend the colors
  return `color-mix(in srgb, ${custom} ${opacity * 100}%, ${base})`;
}

export function sortProjectsLastEdited(a, b) {
  if (!a.last_edited && !b.last_edited) return 0;
  if (!a.last_edited) return -1;
  if (!b.last_edited) return 1;
  return a.last_edited.getTime() - b.last_edited.getTime();
}

export interface OpenedFile {
  filename: string;
  time: Date;
  account_id: string;
}

/**
 * React hook to get recent files from project log with deduplication and optional search filtering
 *
 * @param project_log - The project log from redux store
 * @param max - Maximum number of files to return (default: 100)
 * @param searchTerm - Optional search term to filter filenames (case-insensitive)
 * @returns Array of recent opened files
 */
export function useRecentFiles(
  project_log: any,
  max: number = 100,
  searchTerm: string = "",
): OpenedFile[] {
  return useMemo(() => {
    if (project_log == null || max === 0) return [];

    const dedupe: string[] = [];

    return project_log
      .valueSeq()
      .filter(
        (entry: EventRecordMap) =>
          entry.getIn(["event", "filename"]) &&
          entry.getIn(["event", "event"]) === "open",
      )
      .sort((a, b) => getTime(b) - getTime(a))
      .filter((entry: EventRecordMap) => {
        const fn = entry.getIn(["event", "filename"]);
        if (dedupe.includes(fn)) return false;
        dedupe.push(fn);
        return true;
      })
      .filter((entry: EventRecordMap) =>
        entry
          .getIn(["event", "filename"], "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
      )
      .slice(0, max)
      .map((entry: EventRecordMap) => ({
        filename: entry.getIn(["event", "filename"]),
        time: entry.get("time"),
        account_id: entry.get("account_id"),
      }))
      .toJS() as OpenedFile[];
  }, [project_log, max, searchTerm]);
}

type FileEntry = string | OpenedFile;

/**
 * React hook to create menu items for file lists (starred or recent files)
 *
 * @param files - Array of filenames (strings) or OpenedFile objects
 * @param options - Configuration options
 * @param options.emptyLabel - Label to show when files array is empty
 * @param options.onClick - Optional click handler for each file
 * @param options.labelStyle - Optional CSS style for the label
 * @param options.keyPrefix - Optional prefix for menu item keys
 * @param options.truncLength - Maximum length for truncated filenames (default: 100)
 * @returns Menu items array for Ant Design Dropdown/Menu
 */
export function useFilesMenuItems(
  files: FileEntry[],
  options: {
    emptyLabel: string | React.ReactNode;
    onClick?: (filename: string) => void;
    labelStyle?: CSS;
    keyPrefix?: string;
    truncLength?: number;
  },
): MenuProps["items"] {
  const {
    emptyLabel,
    onClick,
    labelStyle,
    keyPrefix = "",
    truncLength = 100,
  } = options;

  return useMemo(() => {
    if (files.length === 0) {
      return [
        {
          key: "empty",
          label:
            typeof emptyLabel === "string" ? (
              <span style={{ color: COLORS.GRAY }}>{emptyLabel}</span>
            ) : (
              emptyLabel
            ),
          disabled: true,
        },
      ];
    }

    return files.map((file) => {
      const filename = typeof file === "string" ? file : file.filename;
      const info = file_options(filename);
      const icon: IconName = info?.icon ?? "file";

      const label = labelStyle ? (
        <span style={labelStyle}>{trunc_middle(filename, truncLength)}</span>
      ) : (
        trunc_middle(filename, truncLength)
      );

      const menuItem: any = {
        key: keyPrefix ? `${keyPrefix}${filename}` : filename,
        icon: <Icon name={icon} />,
        label,
      };

      if (onClick) {
        menuItem.onClick = () => onClick(filename);
      }

      return menuItem;
    });
  }, [files, emptyLabel, onClick, labelStyle, keyPrefix, truncLength]);
}

/**
 * React hook to create menu items for available servers/apps
 *
 * @param project_id - The project ID
 * @param onServerOpen - Optional callback when a server is opened
 * @returns Menu items array for Ant Design Dropdown/Menu
 */
export function useServersMenuItems(
  project_id: string,
  onServerOpen?: (serverName: NamedServerName) => void,
): MenuProps["items"] {
  const project_map = useTypedRedux("projects", "project_map");
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const available = useAvailableFeatures(project_id);

  return useMemo(() => {
    // Get the project from the project map
    const project = project_map?.get(project_id);

    // Check if project is running
    const isProjectRunning = project?.getIn(["state", "state"]) === "running";

    if (!isProjectRunning) {
      return [
        {
          key: "project-not-running",
          label: (
            <Tip title="The project must be running to launch apps">
              Project not running
            </Tip>
          ),
          disabled: true,
          icon: <Icon name="server" />,
        },
      ];
    }

    // Get available apps
    const availableApps: Array<{
      name: NamedServerName;
      isAvailable: boolean;
    }> = [];

    NAMED_SERVER_NAMES.forEach((appName) => {
      let isAvailable = true;

      // Check if disabled by student project functionality
      switch (appName) {
        case "jupyterlab":
          isAvailable =
            available.jupyter_lab &&
            !student_project_functionality.disableJupyterLabServer;
          break;
        case "jupyter":
          isAvailable =
            available.jupyter_notebook &&
            !student_project_functionality.disableJupyterClassicServer;
          break;
        case "code":
          isAvailable =
            available.vscode &&
            !student_project_functionality.disableVSCodeServer;
          break;
        case "pluto":
          isAvailable =
            available.julia &&
            !student_project_functionality.disablePlutoServer;
          break;
        case "rserver":
          isAvailable =
            available.rserver && !student_project_functionality.disableRServer;
          break;
        case "xpra":
          // this is not yet fully implemented...
          isAvailable = true;
          break;
        default:
          unreachable(appName);
      }

      availableApps.push({ name: appName, isAvailable });
    });

    // Filter to only available apps
    const menuItems = availableApps
      .filter(({ isAvailable }) => isAvailable)
      .map(({ name }) => {
        const spec = SERVER_SPEC[name];
        const label = spec?.longName ?? `${capitalize(name)} Server`;
        const icon: IconName = spec?.icon ?? "server";

        return {
          key: `app:${name}`,
          label,
          icon: <Icon name={icon} />,
          onClick: () => {
            const url = serverURL(project_id, name);
            track("launch-server", { name, project_id });
            window.open(url, "_blank");
            onServerOpen?.(name);
          },
        };
      });

    return menuItems.length > 0
      ? menuItems
      : [
          {
            key: "no-apps",
            label: "No available apps",
            disabled: true,
            icon: <Icon name="server" />,
          },
        ];
  }, [project_id, project_map, student_project_functionality, available]);
}
