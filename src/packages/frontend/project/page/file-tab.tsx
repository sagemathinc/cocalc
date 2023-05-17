/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/

import { Button, Popover, Space } from "antd";
import { CSSProperties, ReactNode } from "react";

import {
  CSS,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { HiddenXSSM, Icon, IconName } from "@cocalc/frontend/components";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { ServerLink } from "@cocalc/frontend/project/named-server-panel";
import track from "@cocalc/frontend/user-tracking";
import { filename_extension, path_split, path_to_tab } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PROJECT_INFO_TITLE } from "../info";
import { TITLE as SERVERS_TITLE } from "../servers";
import { RestartProject } from "../settings/restart-project";
import { StopProject } from "../settings/stop-project";
import { ChatGPTGenerateNotebookButton } from "./home-page/chatgpt-generate-jupyter";
import { HomeRecentFiles } from "./home-page/recent-files";
import { FilesFlyout } from "./flyouts/files";

const { file_options } = require("@cocalc/frontend/editor");

export type FixedTab =
  | "files"
  | "new"
  | "log"
  | "search"
  | "servers"
  | "settings"
  | "info";

type FixedTabs = {
  [name in FixedTab]: {
    label: string;
    icon: IconName;
    tooltip?: string | ((props: { project_id: string }) => ReactNode);
    flyout: (props: { project_id: string }) => ReactNode;
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
    tooltip: "Browse files",
    flyout: FilesFlyout,
    noAnonymous: false,
  },
  new: {
    label: "New",
    icon: "plus-circle",
    tooltip: NewPopover,
    flyout: NewPopover,
    noAnonymous: false,
  },
  log: {
    label: "Log",
    icon: "history",
    tooltip: LogPopover,
    flyout: LogFlyout,
    flyoutTitle: "Recent Files",
    noAnonymous: false,
  },
  search: {
    label: "Find",
    icon: "search",
    tooltip: "Search files in the project",
    flyout: SearchFlyout,
    noAnonymous: false,
  },
  servers: {
    label: SERVERS_TITLE,
    icon: "server",
    tooltip: ServersPopover,
    flyout: ({ project_id }) => ServersPopover({ project_id, flyout: true }),
    noAnonymous: false,
  },
  info: {
    label: PROJECT_INFO_TITLE,
    icon: "microchip",
    tooltip: "Running processes, resource usage, …",
    flyout: ProjectInfoFlyout,
    noAnonymous: false,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    tooltip: SettingsPopover,
    flyout: SettingsPopover,
    noAnonymous: false,
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
      actions.set_active_tab(name);
      track("switch-to-fixed-tab", {
        project_id,
        name,
        how: "click-on-tab",
      });
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
    1 == 1 || // disabled for now
    props.noPopover ||
    IS_MOBILE ||
    (isFixedTab && other_settings.get("hide_action_popovers")) ||
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

function NewPopover({ project_id }) {
  return (
    <div>
      Create or Upload New Files (click for more...)
      <hr />
      <ChatGPTGenerateNotebookButton project_id={project_id} />
    </div>
  );
}

function LogPopover({ project_id }) {
  return (
    <div>
      Project Activity Log (click for more...)
      <hr />
      <HomeRecentFiles project_id={project_id} style={{ maxHeight: "125px" }} />
    </div>
  );
}

function LogFlyout({ project_id, wrap }) {
  return (
    <HomeRecentFiles project_id={project_id} mode={"flyout"} wrap={wrap} />
  );
}

function SettingsPopover({ project_id }) {
  return (
    <div>
      Project settings and controls (click for more...)
      <hr />
      <Button.Group>
        <RestartProject project_id={project_id} />
        <StopProject project_id={project_id} />
      </Button.Group>
    </div>
  );
}

function ServersPopover({ project_id, flyout = false }) {
  const servers = [
    <ServerLink key="jupyterlab" name="jupyterlab" project_id={project_id} />,
    <ServerLink key="jupyter" name="jupyter" project_id={project_id} />,
    <ServerLink key="code" name="code" project_id={project_id} />,
    <ServerLink key="pluto" name="pluto" project_id={project_id} />,
  ].filter((s) => s != null);

  return (
    <div>
      Launch servers
      {!flyout ? ": Jupyter, Pluto, VS Code (click for more details..." : ""}
      <hr />
      <Space direction="vertical">
        {servers}
        {servers.length == 0 && (
          <>
            No available server has been detected in this project environment.
          </>
        )}
      </Space>
    </div>
  );
}

function SearchFlyout({ project_id }) {
  return <div>search flyout {project_id}</div>;
}

function ProjectInfoFlyout({ project_id }) {
  return <div>project info flyout {project_id}</div>;
}
