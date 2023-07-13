/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/

import { Popover } from "antd";
import { CSSProperties, ReactNode } from "react";

import {
  CSS,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { HiddenXSSM, Icon, IconName } from "@cocalc/frontend/components";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import track from "@cocalc/frontend/user-tracking";
import { filename_extension, path_split, path_to_tab } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PROJECT_INFO_TITLE } from "../info";
import { TITLE as SERVERS_TITLE } from "../servers";
import {
  ICON_UPGRADES,
  ICON_USERS,
  TITLE_UPGRADES,
  TITLE_USERS,
} from "../servers/consts";
import {
  CollabsFlyout,
  FilesFlyout,
  LicensesFlyout,
  LogFlyout,
  NewFlyout,
  ProjectInfoFlyout,
  SearchFlyout,
  ServersFlyout,
  SettingsFlyout,
} from "./flyouts";

const { file_options } = require("@cocalc/frontend/editor");

export type FixedTab =
  | "files"
  | "new"
  | "log"
  | "search"
  | "servers"
  | "settings"
  | "info"
  | "users"
  | "upgrades";

export function isFixedTab(tab?: any): tab is FixedTab {
  return typeof tab === "string" && tab in FIXED_PROJECT_TABS;
}

type FixedTabs = {
  [name in FixedTab]: {
    label: string | ReactNode;
    icon: IconName;
    flyout: (props: {
      project_id: string;
      wrap: (content: JSX.Element, style?: CSS) => JSX.Element;
      flyoutWidth: number;
    }) => JSX.Element;
    flyoutTitle?: string | ReactNode;
    noAnonymous?: boolean;
  };
};

// TODO/NOTE: for better or worse I just can't stand the tooltips on the sidebar!
// Disabling them.  If anyone complaints or likes them, I can make them an option.

export const FIXED_PROJECT_TABS: FixedTabs = {
  files: {
    label: "Explorer",
    icon: "folder-open",
    flyout: FilesFlyout,
    noAnonymous: false,
  },
  new: {
    label: "New",
    flyoutTitle: "New file",
    icon: "plus-circle",
    flyout: NewFlyout,
    noAnonymous: false,
  },
  log: {
    label: "Log",
    icon: "history",
    flyout: LogFlyout,
    flyoutTitle: "Recent Files",
    noAnonymous: false,
  },
  search: {
    label: "Find",
    icon: "search",
    flyout: SearchFlyout,
    noAnonymous: false,
  },
  servers: {
    label: SERVERS_TITLE,
    icon: "server",
    flyout: ServersFlyout,
    noAnonymous: false,
  },
  users: {
    label: TITLE_USERS,
    icon: ICON_USERS,
    flyout: CollabsFlyout,
    noAnonymous: false,
  },
  upgrades: {
    label: "Upgrades",
    icon: ICON_UPGRADES,
    flyout: LicensesFlyout,
    flyoutTitle: `Project ${TITLE_UPGRADES}`,
    noAnonymous: false,
  },
  info: {
    label: PROJECT_INFO_TITLE,
    icon: "microchip",
    flyout: ProjectInfoFlyout,
    noAnonymous: false,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    flyout: SettingsFlyout,
    noAnonymous: false,
    flyoutTitle: "Status and Settings",
  },
} as const;

interface Props0 {
  project_id: string;
  label?: string;
  style?: CSSProperties;
  noPopover?: boolean;
  placement?;
  iconStyle?: CSSProperties;
  isFixedTab?: boolean;
  flyout?: FixedTab;
}
interface PropsPath extends Props0 {
  path: string;
  name?: undefined;
}
interface PropsName extends Props0 {
  path?: undefined;
  name: string;
}
type Props = PropsPath | PropsName;

export function FileTab(props: Readonly<Props>) {
  const {
    project_id,
    path,
    name,
    label: label_prop,
    isFixedTab,
    flyout = null,
  } = props;
  let label = label_prop; // label modified below in some situations
  const actions = useActions({ project_id });
  // this is @cocalc/project/project-status/types::ProjectStatus
  const project_status = useTypedRedux({ project_id }, "status");
  const status_alert =
    name === "info" && project_status?.get("alerts")?.size > 0;
  const other_settings = useTypedRedux("account", "other_settings");
  const active_flyout = useTypedRedux({ project_id }, "flyout");
  const flyoutsDefault = other_settings.get("flyouts_default", false);

  // True if there is activity (e.g., active output) in this tab
  const has_activity = useRedux(
    ["open_files", path ?? "", "has_activity"],
    project_id
  );

  function closeFile() {
    if (path == null || actions == null) return;
    actions.close_tab(path);
  }

  function click(e: React.MouseEvent) {
    e.stopPropagation();
    if (actions == null) return;
    if (path != null) {
      if (e.ctrlKey || e.shiftKey || e.metaKey) {
        // shift/ctrl/option clicking on *file* tab opens in a new popout window.
        actions.open_file({
          path,
          new_browser_window: true,
        });
        track("open-file-in-new-window", {
          path,
          project_id,
          how: "shift-ctrl-meta-click-on-tab",
        });
      } else {
        actions.set_active_tab(path_to_tab(path));
        track("switch-to-file-tab", {
          project_id,
          path,
          how: "click-on-tab",
        });
      }
    } else if (name != null) {
      if (flyout != null && flyoutsDefault) {
        actions?.toggleFlyout(flyout);
      } else {
        actions.set_active_tab(name);
        track("switch-to-fixed-tab", {
          project_id,
          name,
          how: "click-on-tab",
        });
      }
    }
  }

  // middle mouse click closes – onMouseUp is important, because otherwise the clipboard buffer is inserted (on Linux)
  function onMouseUp(e) {
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      closeFile();
    }
  }

  function renderFlyoutCaret() {
    if (IS_MOBILE || flyout == null || flyoutsDefault) return;

    const color =
      flyout === active_flyout
        ? COLORS.PROJECT.FIXED_LEFT_ACTIVE
        : active_flyout == null
        ? COLORS.GRAY_L
        : COLORS.GRAY_L0;
    const bg = flyout === active_flyout ? COLORS.GRAY_L0 : undefined;

    return (
      <div
        className="cc-project-fixedtab"
        style={{
          display: "flex",
          alignItems: "center",
          color,
          backgroundColor: bg,
        }}
        onClick={(e) => {
          e.stopPropagation();
          actions?.toggleFlyout(flyout);
        }}
      >
        <Icon
          style={{ padding: "0 3px", margin: "0", color }}
          name="caret-right"
        />
      </div>
    );
  }

  let style: CSSProperties;
  if (path != null) {
    style = {};
  } else {
    // highlight info tab if there is at least one alert
    if (status_alert) {
      style = { backgroundColor: COLORS.ATND_BG_RED_L };
    } else {
      style = { flex: "none" };
    }
  }

  const icon_style: CSSProperties = has_activity
    ? { ...props.iconStyle, color: "orange" }
    : { color: COLORS.FILE_ICON, ...props.iconStyle };

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

  const btnLeft = (
    <>
      <div>
        <Icon style={{ ...icon_style }} name={icon} />
      </div>
      <DisplayedLabel path={path} label={label} inline={!isFixedTab} />
    </>
  );

  const inner = !isFixedTab ? (
    btnLeft
  ) : (
    <div
      style={{
        display: "flex",
        flex: "1 0 auto",
        justifyContent: "space-between",
      }}
    >
      <div
        className="cc-project-fixedtab"
        style={{ textAlign: "center", width: "100%" }}
      >
        {btnLeft}
      </div>
      {renderFlyoutCaret()}
    </div>
  );

  const body = (
    <div
      style={{ ...style, ...props.style }}
      cocalc-test={label}
      onClick={click}
      onMouseUp={onMouseUp}
    >
      <div
        style={{
          width: "100%",
          cursor: "pointer",
          display: path != null ? "flex" : undefined,
          textAlign: "center",
        }}
      >
        {inner}
      </div>
    </div>
  );

  if (
    props.noPopover ||
    IS_MOBILE ||
    isFixedTab ||
    (!isFixedTab && other_settings.get("hide_file_popovers"))
  ) {
    return body;
  }
  // The ! after name is needed since TS doesn't infer that if path is null then name is not null,
  // though our union type above guarantees this.
  return (
    <Popover
      zIndex={10000}
      title={() => {
        if (path != null) {
          return <b>{path}</b>;
        }
        const { tooltip } = FIXED_PROJECT_TABS[name!];
        if (tooltip == null) return <b>{name}</b>;
        if (typeof tooltip == "string") {
          return <b>{tooltip}</b>;
        }
        return tooltip({ project_id });
      }}
      content={
        // only editor-tabs can pop up
        !isFixedTab ? (
          <span style={{ color: COLORS.GRAY }}>
            Hint: Shift+click to open in new window.
          </span>
        ) : undefined
      }
      mouseEnterDelay={1}
      placement={props.placement ?? "bottom"}
    >
      {body}
    </Popover>
  );
}

const LABEL_STYLE: CSS = {
  maxWidth: "250px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginRight: "-15px", // this makes a lot more of the filename visible by undoing the antd tab spacing.
} as const;

const FULLPATH_LABEL_STYLE: CSS = {
  // using a full path for the label instead of just a filename
  textOverflow: "ellipsis",
  // so the ellipsis are on the left side of the path, which is most useful
  direction: "rtl",
  padding: "0 1px", // need less since have ..
} as const;

function DisplayedLabel({ path, label, inline = true }) {
  if (path == null) {
    // a fixed tab (not an actual file)
    const E = inline ? "span" : "div";
    return (
      <HiddenXSSM>
        <E style={{ fontSize: "9pt", textAlign: "center" }}>{label}</E>
      </HiddenXSSM>
    );
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
