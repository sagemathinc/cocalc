/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A single tab in a project.
   - There is one of these for each open file in a project.
   - There is ALSO one for each of the fixed tabs -- files, new, log, search, settings.
*/

const { file_options } = require("../../editor");
import { NavItem } from "react-bootstrap";
import {
  React,
  ReactDOM,
  useActions,
  useEffect,
  useMemo,
  useRedux,
  useRef,
  useState,
  useTypedRedux,
} from "../../app-framework";
import { path_to_tab } from "smc-util/misc";
import { path_split } from "smc-util/misc2";
import { COLORS, HiddenXS, Icon, Tip } from "../../r_misc";

export const FIXED_PROJECT_TABS = {
  files: {
    label: "Files",
    icon: "folder-open-o",
    tooltip: "Browse files",
    no_anonymous: false,
  },
  new: {
    label: "New",
    icon: "plus-circle",
    tooltip: "Create new file, folder, worksheet or terminal",
    no_anonymous: true,
  },
  log: {
    label: "Log",
    icon: "history",
    tooltip: "Log of project activity",
    no_anonymous: true,
  },
  search: {
    label: "Find",
    icon: "search",
    tooltip: "Search files in the project",
    no_anonymous: true,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    tooltip: "Project settings and controls",
    no_anonymous: true,
  },
} as const;

export const DEFAULT_FILE_TAB_STYLES = {
  width: 250,
  borderRadius: "5px 5px 0px 0px",
  flexShrink: 1,
  overflow: "hidden",
} as const;

interface Props0 {
  project_id: string;
  label?: string;
}
interface PropsPath extends Props0 {
  path: string;
  name?: undefined;
}
interface PropsName extends Props0 {
  path?: undefined;
  name: keyof typeof FIXED_PROJECT_TABS;
}
type Props = PropsPath | PropsName;

export const FileTab: React.FC<Props> = React.memo(
  ({ project_id, path, name, label }) => {
    const [x_hovered, set_x_hovered] = useState<boolean>(false);
    const actions = useActions({project_id});
    const active_project_tab = useTypedRedux(
      { project_id },
      "active_project_tab"
    );

    // True if this tab is currently selected:
    const is_selected: boolean = useMemo(() => {
      return active_project_tab == (path != null ? path_to_tab(path) : name);
    }, [active_project_tab, path, name]);

    // True if there is activity (e.g., active output) in this tab
    const has_activity = useRedux(
      ["open_files", path ?? "", "has_activity"],
      project_id
    );

    const tab_ref = useRef(null);
    useEffect(() => {
      // This is a hack to get around a Firefox or react-sortable-hoc bug.  See
      // the long comment in src/smc-webapp/projects/projects-nav.tsx about
      // how to reproduce.
      if (tab_ref.current == null) return;
      ReactDOM.findDOMNode(tab_ref.current)?.children[0].removeAttribute(
        "href"
      );
    });

    function close_file(e) {
      if (path == null) return;
      e.stopPropagation();
      e.preventDefault();
      actions.close_tab(path);
    }

    function click(e): void {
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
        close_file(e);
      }
    }

    let style: React.CSSProperties;
    if (path != null) {
      if (is_selected) {
        style = { ...DEFAULT_FILE_TAB_STYLES, backgroundColor: COLORS.BLUE_BG };
      } else {
        style = DEFAULT_FILE_TAB_STYLES;
      }
    } else {
      style = { flex: "none" };
    }

    const icon_style: React.CSSProperties = { fontSize: "15pt" };
    if (path != null) {
      icon_style.fontSize = "10pt";
    }
    if (has_activity) {
      icon_style.color = "orange";
    }

    const content_style: React.CSSProperties = {
      whiteSpace: "nowrap",
      overflow: "hidden",
    };
    if (path != null) {
      content_style.display = "flex";
    }

    const label_style: React.CSSProperties = {
      flex: 1,
      padding: "0 5px",
      overflow: "hidden",
    };

    if (label == null) {
      if (name != null) {
        label = FIXED_PROJECT_TABS[name].label;
      } else if (path != null) {
        label = path_split(path).tail;
      }
    }
    if (label == null) throw Error("label must not be null");

    if (label.indexOf("/") !== -1) {
      // using a full path for the label instead of just a filename
      label_style.textOverflow = "ellipsis";
      // so the ellipsis are on the left side of the path, which is most useful
      label_style.direction = "rtl";
      label_style.padding = "0 1px"; // need less since have ...
    }

    const x_button_style: React.CSSProperties = {
      float: "right",
      whiteSpace: "nowrap",
    };
    if (x_hovered) {
      x_button_style.color = "lightblue";
    }

    // The ! after name is needed since TS doesn't infer that if path is null then name is not null,
    // though our union type above guarantees this.
    const tooltip = path != null ? path : FIXED_PROJECT_TABS[name!].tooltip;
    const icon =
      path != null
        ? file_options(path)?.icon ?? "code-o"
        : FIXED_PROJECT_TABS[name!].icon;

    let displayed_label: JSX.Element =
      path != null ? <>{label}</> : <HiddenXS>{label}</HiddenXS>;

    if (path != null) {
      // We ONLY show tooltip for filename (it provides the full path).
      // The dir="ltr" below is needed because of the direction 'rtl' in label_style, which
      // we have to compensate for in some situations, e.g.., a file name "this is a file!"
      // will have the ! moved to the beginning by rtl.
      displayed_label = (
        <div style={label_style}>
          <span dir="ltr">
            <Tip title={tooltip} stable={false} placement={"bottom"}>
              {" "}
              {displayed_label}{" "}
            </Tip>
          </span>
        </div>
      );
    }

    return (
      <NavItem
        ref={tab_ref}
        style={style}
        active={is_selected}
        onClick={click}
        cocalc-test={label}
        onMouseDown={onMouseDown}
      >
        <div
          style={{
            width: "100%",
            color: is_selected ? "white" : undefined,
            cursor: "pointer",
          }}
        >
          <div style={x_button_style}>
            {path != null && (
              <Icon
                onMouseOver={() => {
                  set_x_hovered(true);
                }}
                onMouseOut={() => {
                  set_x_hovered(false);
                  actions.clear_ghost_file_tabs();
                }}
                name="times"
                onClick={close_file}
              />
            )}
          </div>
          <div style={content_style}>
            <Icon style={icon_style} name={icon} /> {displayed_label}
          </div>
        </div>
      </NavItem>
    );
  }
);

/*
  propTypes: {
    name: rtypes.string,
    label: rtypes.string, // rendered tab title
    icon: rtypes.string, // Affiliated icon
    project_id: rtypes.string,
    tooltip: rtypes.string,
    is_selected: rtypes.bool,
    file_tab: rtypes.bool, // Whether or not this tab holds a file *editor*
    shrink: rtypes.bool, // Whether or not to shrink to just the icon
    has_activity: rtypes.bool,
  }, // Whether or not some activity is happening with the file

  getInitialState() {
    return { x_hovered: false };
  },

  componentDidMount() {
    return this.strip_href();
  },

  componentDidUpdate() {
    return this.strip_href();
  },

  strip_href() {
    return __guard__(ReactDOM.findDOMNode(this.refs.tab), (x) =>
      x.children[0].removeAttribute("href")
    );
  },
*/
