/*

 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
FrameTitleBar - title bar in a frame, in the frame tree
*/

import {
  Button as AntdButton0,
  Input,
  InputNumber,
  Popover,
  Tooltip,
} from "antd";
import { List } from "immutable";
import { useMemo, useRef } from "react";
import {
  Button as AntdBootstrapButton,
  ButtonGroup,
} from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  redux,
  Rendered,
  useRedux,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  DropdownMenu,
  Icon,
  IconName,
  MenuItem,
  MenuItems,
  r_join,
  Gap,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { copy, path_split, trunc_middle, field_cmp } from "@cocalc/util/misc";
import { Actions } from "../code-editor/actions";
import { is_safari } from "../generic/browser";
import { SaveButton } from "./save-button";
import { ConnectionStatus, EditorDescription, EditorSpec } from "./types";
import LanguageModelTitleBarButton from "../chatgpt/title-bar-button";
import userTracking from "@cocalc/frontend/user-tracking";
import TitleBarTour from "./title-bar-tour";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import SelectComputeServer from "@cocalc/frontend/compute/select-server";
import { computeServersEnabled } from "@cocalc/frontend/compute/config";
import { COMMANDS, Command, MENUS, GROUPS } from "./commands";

// Certain special frame editors (e.g., for latex) have extra
// actions that are not defined in the base code editor actions.
// In all cases, we check these are actually defined before calling
// them to avoid a runtime stacktrace.
interface FrameActions extends Actions {
  zoom_page_width?: (id: string) => void;
  zoom_page_height?: (id: string) => void;
  sync?: (id: string, editor_actions: EditorActions) => void;
  show_table_of_contents?: (id: string) => void;
  build?: (id: string, boolean) => void;
  force_build?: (id: string) => void;
  clean?: (id: string) => void;
  word_count?: (time: number, force: boolean) => void;
  close_and_halt?: (id: string) => void;
}

interface EditorActions extends Actions {
  download?: (id: string) => void;
  restart?: () => void;
  rescan_latex_directive?: () => void;
  halt_jupyter?: () => void;
}

import { AvailableFeatures } from "@cocalc/frontend/project_configuration";
import { COLORS } from "@cocalc/util/theme";

const COL_BAR_BACKGROUND = "#f8f8f8";
const COL_BAR_BACKGROUND_DARK = "#ddd";
const COL_BAR_BORDER = "rgb(204,204,204)";

const title_bar_style: CSS = {
  background: COL_BAR_BACKGROUND_DARK,
  border: `1px solid ${COL_BAR_BORDER}`,
  padding: "1px",
  flexDirection: "row",
  flexWrap: "nowrap",
  flex: "0 0 auto",
  display: "flex",
} as const;

const MAX_TITLE_WIDTH = 20;

const TITLE_STYLE: CSS = {
  background: COL_BAR_BACKGROUND,
  margin: "7.5px 5px",
  fontSize: "10pt",
  whiteSpace: "nowrap",
  display: "inline-block",
  maxWidth: `${MAX_TITLE_WIDTH + 2}ex`,
  overflow: "hidden",
  fontWeight: 550,
} as const;

const CONNECTION_STATUS_STYLE: CSS = {
  padding: "5px 5px 0 5px",
  fontSize: "10pt",
  float: "right",
} as const;

function connection_status_color(status: ConnectionStatus): string {
  switch (status) {
    case "disconnected":
      return "rgb(255, 0, 0)";
    case "connecting":
      return "rgb(255, 165, 0)";
    case "connected":
      return "#666";
    default:
      return "rgb(255, 165, 0)";
  }
}

export function ConnectionStatusIcon({ status }: { status: ConnectionStatus }) {
  return (
    <Icon
      style={{
        color: connection_status_color(status),
      }}
      name={"wifi"}
    />
  );
}

const ICON_STYLE: CSS = {
  width: "20px",
  display: "inline-block",
} as const;

interface Props {
  actions: FrameActions;
  editor_actions: EditorActions;
  path: string;
  project_id: string; // assumed to not change for now
  active_id: string;
  id: string;
  is_full?: boolean;
  is_only?: boolean; // is the only frame
  is_public?: boolean; // public view of a file
  is_paused?: boolean;
  type: string;
  spec: EditorDescription;
  editor_spec: EditorSpec;
  status: string;
  title?: string;
  connection_status?: ConnectionStatus;
  font_size?: number;
  available_features?: AvailableFeatures;
  page?: number | string;
  pages?: number | List<string>;
  is_visible?: boolean;
  tab_is_visible?: boolean;
}

export function FrameTitleBar(props: Props) {
  // Whether this is *the* active currently focused frame:
  const is_active = props.active_id === props.id;
  const track = useMemo(() => {
    const { project_id, path } = props;
    return (action: string) => {
      userTracking("frame-tree", {
        project_id,
        path,
        action,
        type: props.type,
      });
    };
  }, [props.project_id, props.path]);

  const [showMainButtonsPopover, setShowMainButtonsPopover] =
    useState<boolean>(false);

  const [close_and_halt_confirm, set_close_and_halt_confirm] =
    useState<boolean>(false);

  const [showAI, setShowAI] = useState<boolean>(false);

  const [helpSearch, setHelpSearch] = useState<string>("");

  const student_project_functionality = useStudentProjectFunctionality(
    props.project_id,
  );

  if (props.editor_actions?.name == null) {
    throw Error("editor_actions must have name attribute");
  }
  if (props.actions.name == null) {
    throw Error("actions must have name attribute");
  }

  // REDUX:
  // state that is associated with the file being edited, not the
  // frame tree/tab in which this sits.  Note some more should
  // probably be moved down here...

  // These come from editor_actions's store:
  const read_only: boolean = useRedux([props.editor_actions.name, "read_only"]);
  const has_unsaved_changes: boolean = useRedux([
    props.editor_actions.name,
    "has_unsaved_changes",
  ]);
  const has_uncommitted_changes: boolean = useRedux([
    props.editor_actions.name,
    "has_uncommitted_changes",
  ]);
  const show_uncommitted_changes: boolean = useRedux([
    props.editor_actions.name,
    "show_uncommitted_changes",
  ]);
  const is_saving: boolean = useRedux([props.editor_actions.name, "is_saving"]);
  const is_public: boolean = useRedux([props.editor_actions.name, "is_public"]);
  const otherSettings = useRedux(["account", "other_settings"]);
  const hideButtonTooltips = otherSettings.get("hide_button_tooltips");
  const darkMode = otherSettings.get("dark_mode");
  const disableTourRefs = useRef<boolean>(false);
  const tourRefs = useRef<{ [name: string]: { current: any } }>({});
  const getTourRef = (name: string) => {
    if (disableTourRefs.current) return null;
    if (tourRefs.current[name] == null) {
      tourRefs.current[name] = { current: null };
    }
    return tourRefs.current[name];
  };
  const tours = useRedux(["account", "tours"]);
  const hasTour = useMemo(() => {
    if (IS_MOBILE || !isVisible("tour")) {
      return false;
    }
    if (tours?.includes("all") || tours?.includes(`frame-${props.type}`)) {
      return false;
    }
    return true;
  }, [tours, props.type]);

  // comes from actions's store:
  const switch_to_files: List<string> = useRedux([
    props.actions.name,
    "switch_to_files",
  ]);

  function isVisible(name: string, cmd?: Command): boolean {
    if (cmd == null) {
      cmd = COMMANDS[name];
    }
    // some buttons are always visible, e.g., for controlling the frame.
    if (cmd?.alwaysShow) {
      return true;
    }

    // check button spec for current editor:
    const buttons = props.spec.buttons;
    if (buttons != null) {
      if (!buttons[name]) {
        // not in the spec
        return false;
      }
      if (buttons[`-${name}`]) {
        // explicitly hidden by the spec
        return false;
      }
    }
    if (cmd?.disable && student_project_functionality[cmd.disable]) {
      return false;
    }
    if (cmd?.isVisible != null) {
      return cmd.isVisible({ props });
    }
    return true;
  }

  function command(name: string, search?: string): MenuItem | null {
    let cmd = COMMANDS[name];
    if (cmd == null) {
      throw Error(`unknown command '${name}'`);
    }
    const subs = props.editor_spec[props.type]?.customize_buttons?.[name ?? ""];
    if (subs != null) {
      cmd = { ...cmd, ...subs };
    }
    if (!isVisible(name, cmd)) {
      return null;
    }

    if (search) {
      const s = `${cmd.title ?? ""} ${name} ${
        typeof cmd.label == "string" ? cmd.label : ""
      }`;
      if (!s.toLowerCase().includes(search)) {
        return null;
      }
    }

    // it's an action defined by the name of that action, so visible
    // only if that function is defined.
    if (props.editor_actions[name] == null && cmd?.onClick == null) {
      // action not defined, so only chance is if onClick is defined
      // but it isn't
      return null;
    }
    return commandToMenuItem(name, cmd, subs, name);
  }

  function commandToMenuItem(
    name: string,
    cmd: Partial<Command>,
    subs: Partial<Command> | undefined,
    key: string,
  ): MenuItem | null {
    let label = (
      <>
        {typeof cmd.icon == "string" ? (
          <Icon name={cmd.icon} style={{ width: "25px" }} />
        ) : (
          <div style={{ width: "25px", display: "inline-block" }}>
            {cmd.icon}
          </div>
        )}
        {typeof cmd.label == "function"
          ? cmd.label({ props, helpSearch, setHelpSearch })
          : cmd.label}
      </>
    );
    if (cmd.title) {
      label = (
        <Tooltip mouseEnterDelay={0.5} placement="right" title={cmd.title}>
          {label}
        </Tooltip>
      );
    }
    const onClick =
      cmd.onClick != null
        ? (event) => cmd.onClick?.({ props, event, setShowAI })
        : () => {
            // common special case default
            props.actions[name]?.(props.id);
          };
    if (cmd.keyboard) {
      label = (
        <div style={{ width: "300px" }}>
          {label}
          <div style={{ float: "right", color: "#888" }}>{cmd.keyboard}</div>
        </div>
      );
    }
    //     if (cmd.confirm != null) {
    //       // TODO: this can't work -- https://github.com/ant-design/ant-design/issues/22578 -- so we need to create a modal like with Jupyter.
    //       label = (
    //         <Popconfirm
    //           {...cmd.confirm}
    //           onConfirm={onClick}
    //           getPopupContainer={(trigger) => trigger.parentElement!}
    //         >
    //           {label}
    //         </Popconfirm>
    //       );
    //     }

    return {
      disabled: cmd.disabled?.({ props, read_only }),
      label,
      onClick,
      key,
      children: cmd.children?.map((x, i) =>
        commandToMenuItem("", x, subs, `${key}-${i}`),
      ),
      stayOpenOnClick: cmd.stayOpenOnClick,
    };
  }

  function button_height(): string {
    return props.is_only || props.is_full ? "34px" : "30px";
  }

  const MENU_STYLE = {
    margin: `${props.is_only || props.is_full ? "7px" : "5px"} 10px`,
  };

  function button_style(style?: CSS): CSS {
    return {
      ...style,
      ...{ height: button_height(), marginBottom: "5px" },
    };
  }

  function wrapOnClick(props1, props0) {
    if (props0.onClick != null) {
      props1.onClick = async (...args) => {
        try {
          await props0.onClick(...args);
        } catch (err) {
          console.trace(`${err}`);
          props.actions.set_error(
            `${err}. Try reopening this file, refreshing your browser, or restarting your project.  If nothing works, click Help above and make a support request.`,
          );
        }
      };
    }
  }

  function StyledButton(props0) {
    let props1;
    if (hideButtonTooltips) {
      props1 = { ...props0 };
      delete props1.title;
    } else {
      props1 = { ...props0 };
    }
    wrapOnClick(props1, props0);
    return (
      <AntdBootstrapButton {...props1} style={button_style(props1.style)}>
        {props1.children}
      </AntdBootstrapButton>
    );
  }

  function Button(props) {
    return <StyledButton {...props}>{props.children}</StyledButton>;
  }

  function AntdButton(props0) {
    const props1 = { ...props0 };
    wrapOnClick(props1, props0);
    return <AntdButton0 {...props1} />;
  }
  AntdButton.Group = AntdButton0.Group;

  function isExplicitlyHidden(actionName: string): boolean {
    return !!props.spec.buttons?.[`-${actionName}`];
  }

  function click_close(): void {
    props.actions.close_frame(props.id);
  }

  function button_size(): "small" | undefined {
    if (props.is_only || props.is_full) {
      return;
    } else {
      return "small";
    }
  }

  function render_x(): Rendered {
    return (
      <StyledButton
        title={"Close this frame"}
        key={"close"}
        bsSize={button_size()}
        onClick={click_close}
      >
        <Icon name={"times"} />
      </StyledButton>
    );
  }

  function select_type(type: string): void {
    props.actions.set_frame_type(props.id, type);
  }

  function render_types(): Rendered {
    if (!is_active) return;
    const selected_type: string = props.type;
    let selected_icon: IconName | undefined = undefined;
    let selected_short = "";
    const items: MenuItems = [];
    for (const type in props.editor_spec) {
      const spec = props.editor_spec[type];
      if (spec == null) {
        // typescript should prevent this but, also double checking
        // makes this easier to debug.
        console.log(props.editor_spec);
        throw Error(
          `BUG -- ${type} must be defined by the editor_spec, but is not`,
        );
      }
      if (is_public && spec.hide_public) {
        // editor that is explicitly excluded from public view for file,
        // e.g., settings or terminal might use this.
        continue;
      }
      if (selected_type === type) {
        selected_icon = spec.icon;
        selected_short = spec.short;
      }
      items.push({
        key: type,
        label: (
          <>
            <Icon name={spec.icon ? spec.icon : "file"} style={ICON_STYLE} />{" "}
            {spec.name}
          </>
        ),
        onClick: () => select_type(type),
      });
    }

    let title;
    if (selected_short) {
      title = (
        <span cocalc-test={"short-" + selected_short}>
          <Icon name={selected_icon} style={{ marginRight: "5px" }} />
          {title} {selected_short}
        </span>
      );
    } else if (selected_icon != null) {
      title = <Icon name={selected_icon} />;
    }

    // TODO: The "float: left" below is a hack
    // to workaround that this is still in a bootstrap button group.
    return (
      <DropdownMenu
        key="types"
        cocalc-test={"types-dropdown"}
        style={{
          float: "left",
          height: button_height(),
          marginBottom: "5px",
          marginRight: "10px",
        }}
        title={title}
        items={items}
      />
    );
  }

  function renderFrameControls(): Rendered {
    const style: CSS = {
      padding: 0,
      background: is_active ? COL_BAR_BACKGROUND : COL_BAR_BACKGROUND_DARK,
      height: button_height(),
      float: "right",
    };
    return (
      <div
        key="control"
        style={{
          overflow: "hidden",
          display: "inline-block",
          opacity: is_active ? undefined : 0.5,
        }}
        ref={getTourRef("control")}
      >
        <ButtonGroup style={style} key={"close"}>
          {!props.is_full ? render_split_row() : undefined}
          {!props.is_full ? render_split_col() : undefined}
          {!props.is_only ? render_full() : undefined}
          {render_x()}
        </ButtonGroup>

        {render_types()}
      </div>
    );
  }

  function render_full(): Rendered {
    if (props.is_full) {
      return (
        <StyledButton
          disabled={props.is_only}
          title={"Show all frames"}
          key={"compress"}
          bsSize={button_size()}
          onClick={() => {
            track("unset-full");
            props.actions.unset_frame_full();
          }}
          bsStyle={!darkMode ? "warning" : undefined}
          style={{ color: darkMode ? "orange" : undefined }}
        >
          <Icon name={"compress"} />
        </StyledButton>
      );
    } else {
      return (
        <StyledButton
          disabled={props.is_only}
          key={"expand"}
          title={"Show only this frame"}
          bsSize={button_size()}
          onClick={() => {
            track("set-full");
            props.actions.set_frame_full(props.id);
          }}
        >
          <Icon name={"expand"} />
        </StyledButton>
      );
    }
  }

  function render_split_row(): Rendered {
    return (
      <StyledButton
        key={"split-row"}
        title={"Split frame horizontally into two rows"}
        bsSize={button_size()}
        onClick={(e) => {
          e.stopPropagation();
          if (props.is_full) {
            track("unset-full");
            return props.actions.unset_frame_full();
          } else {
            track("split-row");
            return props.actions.split_frame("row", props.id);
          }
        }}
      >
        <Icon name="horizontal-split" />
      </StyledButton>
    );
  }

  function render_split_col(): Rendered {
    return (
      <StyledButton
        key={"split-col"}
        title={"Split frame vertically into two columns"}
        bsSize={button_size()}
        onClick={(e) => {
          e.stopPropagation();
          if (props.is_full) {
            track("unset-full");
            return props.actions.unset_frame_full();
          } else {
            track("split-col");
            return props.actions.split_frame("col", props.id);
          }
        }}
      >
        <Icon name="vertical-split" />
      </StyledButton>
    );
  }

  function render_switch_to_file(): Rendered {
    if (
      !isVisible("switch_to_file") ||
      props.actions.switch_to_file == null ||
      switch_to_files == null ||
      switch_to_files.size <= 1
    ) {
      return;
    }

    const items: MenuItems = switch_to_files.toJS().map((path) => {
      return {
        key: path,
        label: (
          <>
            {props.path == path ? <b>{path}</b> : path}
            {props.actions.path == path ? " (main)" : ""}
          </>
        ),
        onClick: () => props.actions.switch_to_file(path, props.id),
      };
    });

    return (
      <DropdownMenu
        key={"switch-to-file"}
        button={true}
        style={{
          height: button_height(),
        }}
        title={path_split(props.path).tail}
        items={items}
      />
    );
  }

  function show_labels(): boolean {
    return !!(props.is_only || props.is_full);
  }

  function render_timetravel(): Rendered {
    if (!isVisible("time_travel")) {
      return;
    }
    return (
      <Tooltip title="Show TimeTravel edit history">
        <AntdButton
          key={"timetravel"}
          style={{
            ...button_style(),
            ...(!darkMode
              ? { color: "white", background: "#5bc0de" }
              : undefined),
          }}
          size={button_size()}
          onClick={(event) => {
            track("time-travel");
            if (props.actions.name != props.editor_actions.name) {
              // a subframe editor -- always open time travel in a name tab.
              props.editor_actions.time_travel({ frame: false });
              return;
            }
            // If a time_travel frame type is available and the
            // user does NOT shift+click, then open as a frame.
            // Otherwise, it opens as a new tab.
            const frame =
              !event.shiftKey && props.editor_spec["time_travel"] != null;
            props.actions.time_travel({
              frame,
            });
          }}
        >
          <Icon name="history" />
        </AntdButton>
      </Tooltip>
    );
  }

  function rander_artificial_intelligence(): Rendered {
    if (
      !isVisible("chatgpt") ||
      !redux.getStore("projects").hasLanguageModelEnabled(props.project_id)
    ) {
      return;
    }
    return (
      <Tooltip title="Get help using an Artificial Intelligence Large Language model (e.g., ChatGPT)">
        <LanguageModelTitleBarButton
          showDialog={showAI}
          setShowDialog={setShowAI}
          project_id={props.project_id}
          buttonRef={getTourRef("chatgpt")}
          key={"chatgpt"}
          id={props.id}
          actions={props.actions}
          path={props.path}
          buttonSize={button_size()}
          buttonStyle={{
            ...button_style(),
            ...(!darkMode
              ? { backgroundColor: "rgb(16, 163, 127)", color: "white" }
              : undefined),
          }}
          visible={props.tab_is_visible && props.is_visible}
        />
      </Tooltip>
    );
  }

  function render_save(labels: boolean): Rendered {
    if (!isVisible("save")) {
      return;
    }
    return (
      <SaveButton
        key="save"
        has_unsaved_changes={has_unsaved_changes}
        has_uncommitted_changes={has_uncommitted_changes}
        show_uncommitted_changes={show_uncommitted_changes}
        set_show_uncommitted_changes={
          props.editor_actions.set_show_uncommitted_changes
        }
        read_only={read_only}
        is_public={is_public}
        is_saving={is_saving}
        no_labels={!labels}
        size={button_size()}
        style={button_style()}
        onClick={() => {
          props.editor_actions.save(true);
          props.actions.focus(props.id);
        }}
        type={darkMode ? "default" : undefined}
      />
    );
  }

  function render_save_timetravel_group(labels): Rendered {
    const v: Rendered[] = [];
    let x: Rendered;
    if ((x = render_save(labels))) v.push(x);
    if ((x = render_timetravel())) v.push(x);
    if ((x = rander_artificial_intelligence())) v.push(x);
    if (v.length == 1) return v[0];
    if (v.length > 0) {
      return <ButtonGroup key={"save-group"}>{v}</ButtonGroup>;
    }
  }

  function createMenu(name: string) {
    const { label, pos, groups } = MENUS[name];
    const v: MenuItem[] = [];
    for (const group of groups) {
      const w: { pos?: number; item: MenuItem }[] = [];
      for (const commandName of GROUPS[group]) {
        const item = command(commandName);
        if (item != null) {
          w.push({ item, pos: COMMANDS[commandName].pos ?? 1e6 });
        }
        if (helpSearch.trim() && commandName == "help_search") {
          const search = helpSearch.trim().toLowerCase();
          // special case -- the search menu item
          for (const commandName in COMMANDS) {
            if (commandName == "help_search") continue;
            const item = command(commandName, search);
            if (item != null) {
              w.push({
                item: { ...item, key: `__search-${item.key}` },
                pos: COMMANDS[commandName].pos ?? 1e6,
              });
              if (w.length > 10) {
                break;
              }
            }
          }
          w.push({ type: "divider", key: `divider-${w.length}` });
        }
      }
      if (w.length > 0) {
        if (w.length > 1) {
          w.sort(field_cmp("pos"));
        }
        if (v.length > 0) {
          v.push({ type: "divider", key: `divider-${v.length}` });
        }
        v.push(...w.map((x) => x.item));
      }
    }
    if (v.length == 0) {
      return null;
    }
    return {
      menu: (
        <DropdownMenu
          key={`menu-${name}`}
          style={MENU_STYLE}
          title={label}
          items={v}
        />
      ),
      pos,
    };
  }

  function renderMenus() {
    if (!is_active) return;

    const v: { menu: JSX.Element; pos: number }[] = [];
    for (const name in MENUS) {
      const x = createMenu(name);
      if (x != null) {
        v.push(x);
      }
    }
    v.sort(field_cmp("pos"));
    return (
      <div
        key="dropdown-menus"
        style={{
          display: "inline-block",
          paddingTop: props.is_only || props.is_full ? "7px" : "5px",
          borderLeft: "1px solid #ccc",
          borderRight: "1px solid #ccc",
        }}
      >
        {v.map((x) => x.menu)}
      </div>
    );
  }

  function render_buttons(
    forceLabels?: boolean,
    style?: CSS,
    noRefs?,
  ): Rendered {
    if (!is_active) return;
    if (!(props.is_only || props.is_full)) {
      // When in split view, we let the buttonbar flow around and hide, so that
      // extra buttons are cleanly not visible when frame is thin.
      style = {
        display: "flex",
        maxHeight: "30px",
        ...style,
      };
    } else {
      style = {
        display: "flex",
        maxHeight: "34px",
        marginLeft: "2px",
        ...style,
      };
    }
    try {
      if (noRefs) {
        // When rendering the buttons for the all button popover, we
        // must NOT set the tour refs, since if we do, then they get
        // stolen and the tour then breaks! So we temporarily disable
        // the refs and re-enable them in the finally below.
        disableTourRefs.current = true;
      }

      const labels: boolean = forceLabels ?? show_labels();

      const v: (JSX.Element | undefined)[] = [];
      v.push(renderPage());
      <div style={{ border: "1px solid #ccc", margin: "5px 0 5px 5px" }} />;
      v.push(renderMenus());
      <div style={{ border: "1px solid #ccc", margin: "5px 5px 5px 0px" }} />;
      v.push(render_save_timetravel_group(labels));
      v.push(render_switch_to_file());

      const w: Rendered[] = [];
      for (const c of v) {
        if (c != null) {
          w.push(c);
        }
      }

      return (
        <div
          style={style}
          key={"buttons"}
          className={"cc-frame-tree-title-bar-buttons"}
        >
          {r_join(w, <Gap />)}
        </div>
      );
    } finally {
      if (noRefs) {
        disableTourRefs.current = false;
      }
    }
  }

  function renderMainMenusAndButtons(): Rendered {
    // This is complicated below (with the flex display) in order to have
    // a drop down menu that actually appears
    // and *ALSO* have buttons that vanish when there are many of them.
    return (
      <div
        style={{
          flexFlow: "row nowrap",
          display: "flex",
          flex: 1,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {render_buttons()}
      </div>
    );
  }

  function allButtonsPopover() {
    return (
      <Popover
        overlayStyle={{ zIndex: 990 }}
        open={
          props.tab_is_visible && props.is_visible && showMainButtonsPopover
        }
        content={() => {
          return (
            <div style={{ display: "flex", maxWidth: "100vw", height: "34px" }}>
              <div
                style={{
                  marginLeft: "3px",
                  marginRight: "3px",
                }}
              >
                {render_buttons(
                  true,
                  { maxHeight: "50vh", display: "block" },
                  true,
                )}
              </div>
              <div>{renderFrameControls()}</div>
              <Icon
                onClick={() => setShowMainButtonsPopover(false)}
                name="times"
                style={{
                  color: COLORS.GRAY_M,
                  marginLeft: "10px",
                }}
              />
            </div>
          );
        }}
      >
        <div
          key="all-buttons"
          ref={getTourRef("all-buttons")}
          style={{ display: "inline-block" }}
        >
          <AntdButton
            type="text"
            style={{
              padding: "0 5px",
              height: props.is_only || props.is_full ? "34px" : "30px",
            }}
            onClick={() => setShowMainButtonsPopover(!showMainButtonsPopover)}
          >
            <Icon name="ellipsis" rotate="90" />
          </AntdButton>
        </div>
      </Popover>
    );
  }

  function renderConnectionStatus(): Rendered | undefined {
    if (!props.connection_status || !isVisible("connection_status")) {
      return;
    }
    if (props.connection_status == "connected") {
      // To reduce clutter show nothing when connected.
      // NOTE: Keep this consistent with
      // cocalc/src/@cocalc/frontend/project/websocket/websocket-indicator.tsx
      return;
    }
    const is_active = props.active_id === props.id;
    const style = is_active
      ? Object.assign({}, CONNECTION_STATUS_STYLE, {
          background: COL_BAR_BACKGROUND,
        })
      : CONNECTION_STATUS_STYLE;

    return (
      <span style={style} title={props.connection_status}>
        <ConnectionStatusIcon status={props.connection_status} />
      </span>
    );
  }

  function renderComputeServer() {
    if (!isVisible("compute_server") || !computeServersEnabled()) {
      return null;
    }
    const { type } = props;
    if (type != "terminal" && type != "jupyter_cell_notebook") {
      // ONLY terminal and jupyter are supported
      return null;
    }
    return (
      <SelectComputeServer
        actions={props.actions}
        frame_id={props.id}
        type={type}
        style={{
          marginRight: "3px",
          marginTop: "1px",
          height: button_height(),
        }}
        project_id={props.project_id}
        path={props.path}
      />
    );
  }

  function renderTitle(): Rendered {
    let title: string = "";
    let icon: IconName | undefined = undefined;
    if (props.title !== undefined) {
      title = props.title;
    }
    if (props.editor_spec != null) {
      const spec = props.editor_spec[props.type];
      if (spec != null) {
        icon = spec.icon;
        if (!title) {
          if (spec.name) {
            title = spec.name;
          } else if (spec.short) {
            title = spec.short;
          }
        }
      }
    }

    const body = (
      <div
        ref={getTourRef("title")}
        style={{
          ...TITLE_STYLE,
          margin: `${props.is_only || props.is_full ? "7px" : "5px"} 5px`,
          color: is_active ? undefined : "#777",
        }}
      >
        {icon && <Icon name={icon} style={{ marginRight: "5px" }} />}
        {trunc_middle(title, MAX_TITLE_WIDTH)}
      </div>
    );
    if (title.length >= MAX_TITLE_WIDTH) {
      return <Tooltip title={title}>{body}</Tooltip>;
    }
    return body;
  }

  function renderCloseAndHaltConfirm(): Rendered {
    if (!close_and_halt_confirm) return;
    return (
      <div
        style={{
          padding: "5px",
          borderBottom: "1px solid lightgrey",
          position: "absolute",
          width: "100%",
          zIndex: 100,
          background: "white",
          boxShadow: "rgba(0, 0, 0, 0.25) 0px 6px 24px",
        }}
      >
        Halt the server and close this?
        <Button
          onClick={() => {
            set_close_and_halt_confirm(false);
            props.actions.close_and_halt?.(props.id);
          }}
          style={{
            marginLeft: "20px",
            marginRight: "5px",
          }}
          bsStyle="danger"
        >
          <Icon name={"PoweroffOutlined"} /> Close and Halt
        </Button>
        <Button onClick={() => set_close_and_halt_confirm(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  function renderConfirmBar(): Rendered {
    return (
      <div style={{ position: "relative" }}>{renderCloseAndHaltConfirm()}</div>
    );
  }

  function renderPage() {
    if (
      props.page == null ||
      props.pages == null ||
      isExplicitlyHidden("page")
    ) {
      // do not render anything unless both page and pages are set
      return;
    }
    let content;
    if (typeof props.pages == "number") {
      // pages contains the number of pages and page must also be a number
      if (props.pages <= 1) {
        // only one page so don't render anything
        return;
      }
      // Below we use step=-1 and do not set min/max so that
      // the up/down buttons are switched from usual, which makes
      // sense for page numbers.

      // Style: the button heights actually changes a bit depending
      // on if it's the only frame or not, so our input box also has
      // to adjust.
      content = (
        <>
          <InputNumber
            style={{
              width: "9ex",
              height: !props.is_only && !props.is_full ? "30px" : undefined,
            }}
            step={-1}
            value={props.page}
            onChange={(page: number) => {
              if (!page) return;
              if (page <= 1) {
                page = 1;
              }
              if (typeof props.pages == "number" && page >= props.pages) {
                page = props.pages;
              }
              props.actions.setPage(props.id, page);
            }}
          />{" "}
          / {props.pages}
        </>
      );
    } else {
      // pages is a immutable list of string names of the pages
      if (props.pages.size <= 1) {
        return;
      }
      const n = props.pages.indexOf(`${props.page}`);
      if (n == -1) {
        content = (
          <>
            <Input
              style={{ width: "9ex", height: "30px" }}
              value={props.page}
              onChange={(e) => {
                if (!e.target.value) return;
                props.actions.setPage(props.id, e.target.value);
              }}
            />{" "}
            / {props.pages.size}
          </>
        );
      } else {
        content = (
          <>
            <Input
              style={{ width: "9ex", height: "30px" }}
              value={props.page}
              onChange={(e) => props.actions.setPage(props.id, e.target.value)}
            />{" "}
            ({n + 1} of {props.pages.size})
          </>
        );
      }
    }
    return (
      <span
        key={"page"}
        style={{
          height: "30px",
          lineHeight: "30px",
          textAlign: "center",
        }}
      >
        {content}
      </span>
    );
  }

  let style;
  style = copy(title_bar_style);
  style.background = COL_BAR_BACKGROUND;
  if (!props.is_only && !props.is_full) {
    style.maxHeight = "34px";
  } else {
    style.maxHeight = "38px";
  }
  // position relative, so we can absolute position the
  // frame controls to the right
  style.position = "relative";

  if (is_safari()) {
    // ugly hack....
    // for some reason this is really necessary on safari, but
    // breaks on everything else!
    if (props.is_only || props.is_full) {
      style.minHeight = "36px";
    } else {
      style.minHeight = "32px";
    }
  }

  return (
    <>
      <div
        style={style}
        id={`titlebar-${props.id}`}
        className={"cc-frame-tree-title-bar"}
      >
        {allButtonsPopover()}
        {renderComputeServer()}
        {renderTitle()}
        {renderMainMenusAndButtons()}
        {renderConnectionStatus()}
        {renderFrameControls()}
      </div>
      {renderConfirmBar()}
      {hasTour && props.is_visible && props.tab_is_visible && (
        <TitleBarTour refs={tourRefs} />
      )}
    </>
  );
}
