/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/
const { file_options } = require("@cocalc/frontend/editor");
import {
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { CSSProperties } from "react";
import { filename_extension, path_split, path_to_tab } from "@cocalc/util/misc";
import { HiddenXSSM, Icon, IconName } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { PROJECT_INFO_TITLE } from "../info";
import { Popover } from "antd";

export type FixedTab = "files" | "new" | "log" | "search" | "settings" | "info";

type FixedTabs = {
  [name in FixedTab]: {
    label: string;
    icon: IconName;
    tooltip: string;
    noAnonymous?: boolean;
  };
};

export const FIXED_PROJECT_TABS: FixedTabs = {
  files: {
    label: "Files",
    icon: "folder-open",
    tooltip: "Browse files",
    noAnonymous: false,
  },
  new: {
    label: "New",
    icon: "plus-circle",
    tooltip: "Create new file, folder, worksheet or terminal",
    noAnonymous: false,
  },
  log: {
    label: "Log",
    icon: "history",
    tooltip: "Log of project activity",
    noAnonymous: false,
  },
  search: {
    label: "Find",
    icon: "search",
    tooltip: "Search files in the project",
    noAnonymous: false,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    tooltip: "Project settings and controls",
    noAnonymous: true,
  },
  info: {
    label: PROJECT_INFO_TITLE,
    icon: "microchip",
    tooltip: "Running processes, resource usage, …",
    noAnonymous: true,
  },
} as const;

export const DEFAULT_FILE_TAB_STYLES = {
  borderRadius: "5px 5px 0px 0px",
} as const;

interface Props0 {
  project_id: string;
  label?: string;
  style?: CSSProperties;
  noPopover?: boolean;
}
interface PropsPath extends Props0 {
  path: string;
  name?: undefined;
}
interface PropsName extends Props0 {
  path?: undefined;
  name: FixedTab;
}
type Props = PropsPath | PropsName;

export function FileTab(props: Props) {
  const { project_id, path, name, label: label_prop } = props;
  let label = label_prop; // label modified below in some situations
  const actions = useActions({ project_id });
  // this is @cocalc/project/project-status/types::ProjectStatus
  const project_status = useTypedRedux({ project_id }, "status");
  const status_alert =
    name === "info" && project_status?.get("alerts")?.size > 0;

  // True if there is activity (e.g., active output) in this tab
  const has_activity = useRedux(
    ["open_files", path ?? "", "has_activity"],
    project_id
  );

  function closeFile() {
    if (path == null || actions == null) return;
    actions.close_tab(path);
  }

  function click(e): void {
    if (actions == null) return;
    if (path != null) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) {
        // shift/ctrl/option clicking on *file* tab opens in a new popout window.
        actions.open_file({
          path,
          new_browser_window: true,
        });
      } else {
        actions.set_active_tab(path_to_tab(path));
      }
    } else if (name != null) {
      actions.set_active_tab(name);
    }
  }

  // middle mouse click closes
  function onMouseDown(e) {
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      closeFile();
    }
  }

  let style: CSSProperties;
  if (path != null) {
    style = DEFAULT_FILE_TAB_STYLES;
  } else {
    // highlight info tab if there is at least one alert
    if (status_alert) {
      style = { backgroundColor: COLORS.ATND_BG_RED_L };
    } else {
      style = { flex: "none" };
    }
  }

  const icon_style: CSSProperties = has_activity
    ? { color: "orange" }
    : { color: COLORS.FILE_ICON };

  if (label == null) {
    if (name != null) {
      label = FIXED_PROJECT_TABS[name].label;
    } else if (path != null) {
      label = path_split(path).tail;
    }
  }
  if (label == null) throw Error("label must not be null");

  const icon =
    path != null
      ? file_options(path)?.icon ?? "code-o"
      : FIXED_PROJECT_TABS[name!].icon;

  let body = (
    <div
      style={{ ...style, ...props.style }}
      cocalc-test={label}
      onClick={click}
      onMouseDown={onMouseDown}
    >
      <div
        style={{
          width: "100%",
          cursor: "pointer",
          display: "flex",
        }}
      >
        <div>
          <Icon style={{ ...icon_style, marginRight: "5px" }} name={icon} />
        </div>
        <DisplayedLabel path={path} label={label} />
      </div>
    </div>
  );

  if (props.noPopover) {
    return body;
  }
  // The ! after name is needed since TS doesn't infer that if path is null then name is not null,
  // though our union type above guarantees this.
  return (
    <Popover
      zIndex={10000}
      title={
        <span style={{ fontWeight: "bold" }}>
          {path != null ? path : FIXED_PROJECT_TABS[name!].tooltip}
        </span>
      }
      content={
        <span style={{ color: COLORS.GRAY }}>
          Hint: Shift-Click to open in new window.
        </span>
      }
      mouseEnterDelay={0.9}
      placement={"bottom"}
    >
      {body}
    </Popover>
  );
}

const LABEL_STYLE = {
  maxWidth: "250px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as CSSProperties;

const FULLPATH_LABEL_STYLE = {
  // using a full path for the label instead of just a filename
  textOverflow: "ellipsis",
  // so the ellipsis are on the left side of the path, which is most useful
  direction: "rtl",
  padding: "0 1px", // need less since have ..
} as const;

function DisplayedLabel({ path, label }) {
  if (path == null) {
    // a fixed tab (not an actual file)
    return <HiddenXSSM>{label}</HiddenXSSM>;
  }

  let ext = filename_extension(label);
  if (ext) {
    ext = "." + ext;
    label = label.slice(0, -ext.length);
  }
  // The "ltr" below is needed because of the direction 'rtl' in label_style, which
  // we have to compensate for in some situations, e.g., a file name "this is a file!"
  // will have the ! moved to the beginning by rtl.
  return (
    <div
      style={{
        ...LABEL_STYLE,
        ...(label.includes("/") ? FULLPATH_LABEL_STYLE : undefined),
      }}
    >
      <span style={{ direction: "ltr" }}>
        {label}
        <span style={{ color: COLORS.FILE_EXT }}>{ext}</span>
      </span>
    </div>
  );
}
