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
import { useEffect, useMemo, useRef } from "react";
import {
  Button as AntdBootstrapButton,
  ButtonGroup,
} from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  redux,
  Rendered,
  useForceUpdate,
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
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { EditorFileInfoDropdown } from "@cocalc/frontend/editors/file-info-dropdown";
import { copy, path_split, trunc_middle } from "@cocalc/util/misc";
import { Actions } from "../code-editor/actions";
import { is_safari } from "../generic/browser";
import { SaveButton } from "./save-button";
import { ConnectionStatus, EditorDescription, EditorSpec } from "./types";
import LanguageModel from "../chatgpt/title-bar-button";
import userTracking from "@cocalc/frontend/user-tracking";
import TitleBarTour from "./title-bar-tour";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import SelectComputeServer from "@cocalc/frontend/compute/select-server";
import { computeServersEnabled } from "@cocalc/frontend/compute/config";
import { COMMANDS, Command } from "./commands";

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
  fontWeight: 550,
} as const;

const CONNECTION_STATUS_STYLE: CSS = {
  padding: "5px 5px 0 5px",
  fontSize: "10pt",
  float: "right",
} as const;

function removeNulls(v) {
  return v.filter((x) => x != null);
}

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

export const FrameTitleBar: React.FC<Props> = (props: Props) => {
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
  const buttons_ref = useRef<
    { [button_name: string]: true } | null | undefined
  >(null);

  const force_update = useForceUpdate();

  const [showMainButtonsPopover, setShowMainButtonsPopover] =
    useState<boolean>(false);

  useEffect(() => {
    // clear button cache whenever type changes; otherwise,
    // the buttons at the top wouldn't change.
    buttons_ref.current = null;
    force_update();
  }, [props.type]);

  const [close_and_halt_confirm, set_close_and_halt_confirm] =
    useState<boolean>(false);

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
  const fullscreen: undefined | "default" | "kiosk" = useRedux(
    "page",
    "fullscreen",
  );

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
    if (IS_MOBILE || !is_visible("tour", true)) {
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

  function command(name: string): MenuItem | null {
    let cmd = COMMANDS[name];
    if (cmd == null) {
      throw Error(`unknown command '${name}'`);
    }
    const subs =
      props.editor_spec[props.type]?.customize_buttons?.[cmd.action ?? ""];
    return commandToMenuItem(cmd, subs);
  }

  function commandToMenuItem(
    cmd: Command,
    subs?: Partial<Command>,
  ): MenuItem | null {
    if (cmd.action && !is_visible(cmd.action)) {
      return null;
    }
    if (cmd.disable && student_project_functionality[cmd.disable]) {
      return null;
    }
    if (subs != null) {
      cmd = { ...cmd, ...subs };
    }
    let label = (
      <>
        {typeof cmd.icon == "string" ? (
          <Icon name={cmd.icon} style={{ width: "25px" }} />
        ) : (
          <div style={{ width: "25px", display: "inline-block" }}>
            {cmd.icon}
          </div>
        )}
        {typeof cmd.label == "function" ? cmd.label({ props }) : cmd.label}
      </>
    );
    if (cmd.title) {
      label = (
        <Tooltip mouseEnterDelay={0.5} placement="right" title={cmd.title}>
          {label}
        </Tooltip>
      );
    }
    let onClick =
      cmd.onClick != null
        ? (event) => cmd.onClick?.({ props, event })
        : undefined;
    if (onClick == null && cmd.action) {
      onClick = () => {
        // common special case default
        props.actions[cmd.action ?? ""]?.(props.id);
      };
    } else {
    }
    if (onClick == null) {
      throw Error(`one of onClick or action must be specified for ${name}`);
    }
    if (cmd.keyboard) {
      label = (
        <div style={{ width: "300px" }}>
          {label}
          <div style={{ float: "right", color: "#888" }}>{cmd.keyboard}</div>
        </div>
      );
    }
    let key;
    if (typeof cmd.label == "string") {
      key = cmd.label;
    } else if (typeof cmd.title == "string") {
      key = cmd.title;
    } else if (typeof cmd.action == "string") {
      key = cmd.action;
    } else if (typeof cmd.icon == "string") {
      key = cmd.icon;
    } else {
      key = "xxx";
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
      children: cmd.children?.map((x) => commandToMenuItem(x, subs)),
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

  function is_visible(action_name: string, explicit?: boolean): boolean {
    if (props.editor_actions[action_name] == null) {
      return false;
    }
    if (isExplicitlyHidden(action_name)) {
      return false;
    }

    if (buttons_ref.current == null) {
      if (!explicit) {
        return true;
      }
      let buttons = props.spec.buttons ?? {};
      buttons_ref.current =
        typeof buttons == "function" ? buttons(props.path) : buttons;
    }

    return !!buttons_ref.current?.[action_name];
  }

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
        hide_down={false}
        title={title}
        items={items}
      />
    );
  }

  function render_control(): Rendered {
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

  function splitMenuGroup() {
    return removeNulls([
      command("split-row"),
      command("split-col"),
      command("maximize"),
      command("close"),
    ]);
  }

  function showPanelsGroup() {
    return removeNulls([
      command("sync"),
      command("show-time-travel"),
      command("print"),
      command("show-terminal"),
      command("show-shell"),
      command("show-table-of-contents"),
      command("show-guide"),
      command("show-search"),
      command("show-overview"),
      command("show-pages"),
      command("show-slideshow"),
      command("show-speaker-notes"),
      command("edit-init-script"),
      command("show-help"),
    ]);
  }

  function findGroup() {
    return removeNulls([
      command("show-search"),
      command("find"),
      command("replace"),
      command("goto-line"),
    ]);
  }

  function render_switch_to_file(): Rendered {
    if (
      !is_visible("switch_to_file") ||
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

  function render_download(labels): Rendered {
    if (
      !is_visible("download") ||
      props.editor_actions.download == null ||
      student_project_functionality.disableActions
    ) {
      return;
    }
    return (
      <StyledButton
        key={"download"}
        title={"Download this file"}
        bsSize={button_size()}
        onClick={() => props.editor_actions.download?.(props.id)}
      >
        <Icon name={"cloud-download"} />{" "}
        {labels ? <VisibleMDLG>Download</VisibleMDLG> : undefined}
      </StyledButton>
    );
  }

  function copyGroup() {
    return removeNulls([command("cut"), command("copy"), command("paste")]);
  }

  function zoomMenuGroup() {
    return removeNulls([
      command("zoom-page-height"),
      command("zoom-page-width"),
      command("zoom-in"),
      command("zoom-out"),
      command("set-zoom"),
    ]);
  }

  function undoRedoGroup() {
    return removeNulls([command("undo"), command("redo")]);
  }

  function actionsGroup() {
    return removeNulls([
      command("build"),
      command("force-build"),
      command("format"),
      command("auto-indent"),
      command("halt-jupyter"),
      command("pause"),
      command("clear"),
      command("kick-other-users-out"),
    ]);
  }

  function renderEditMenu() {
    const v: MenuItem[] = undoRedoGroup();
    for (const x of [copyGroup(), findGroup(), actionsGroup()]) {
      if (x.length > 0) {
        if (v.length > 0) {
          v.push({ type: "divider" });
        }
        v.push(...x);
      }
    }

    if (v.length > 0) {
      return (
        <DropdownMenu
          key="edit-menu"
          style={MENU_STYLE}
          title={"Edit"}
          items={v}
        />
      );
    }
  }

  function renderViewMenu() {
    const v: MenuItem[] = [];
    let x;
    x = zoomMenuGroup();
    if (x.length > 0) {
      v.push(...x);
    }
    x = splitMenuGroup();
    if (x.length > 0) {
      v.push({ type: "divider" });
      v.push(...x);
    }
    x = showPanelsGroup();
    if (x.length > 0) {
      v.push({ type: "divider" });
      v.push(...x);
    }

    if (v.length > 0) {
      return (
        <DropdownMenu
          key="view-menu"
          style={MENU_STYLE}
          title={"View"}
          items={v}
        />
      );
    }
  }

  function show_labels(): boolean {
    return !!(props.is_only || props.is_full);
  }

  function render_chatgpt(labels): Rendered {
    if (
      !is_visible("chatgpt") ||
      !redux.getStore("projects").hasLanguageModelEnabled(props.project_id)
    ) {
      return;
    }
    return (
      <LanguageModel
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
        labels={labels}
        visible={props.tab_is_visible && props.is_visible}
      />
    );
  }

  function render_tour(labels): Rendered {
    if (!hasTour) {
      return;
    }
    return (
      <div ref={getTourRef("tour")} key={"tour"}>
        <AntdButton
          type="primary"
          title={"Take the tour!"}
          size={button_size()}
          onClick={() => {
            track("tour");
            userTracking("tour", { name: `frame-${props.type}` });
            props.actions.set_frame_full(props.id);
            // we have to wait until the frame renders before
            // setting the tour; otherwise, the references won't
            // be defined and it won't work.
            setTimeout(
              () => props.actions.set_frame_tree({ id: props.id, tour: true }),
              1,
            );
          }}
          style={{ border: "1px solid rgb(217, 217, 217)", ...button_style() }}
        >
          <div style={{ display: "inline-block" }}>
            <Icon name="map" />
            <VisibleMDLG>{labels ? " Tour" : undefined}</VisibleMDLG>
          </div>
        </AntdButton>
      </div>
    );
  }

  function render_reload(labels): Rendered {
    if (!is_visible("reload", true)) {
      return;
    }
    return (
      <Button
        key={"reload"}
        title={"Reload this file"}
        bsSize={button_size()}
        onClick={() => props.actions.reload(props.id)}
      >
        <Icon name="reload" />
        <VisibleMDLG>{labels ? " Reload" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  function render_restart(labels): Rendered {
    if (!is_visible("restart", true)) {
      return;
    }
    return (
      <Button
        key={"restart"}
        title={"Restart service"}
        bsSize={button_size()}
        onClick={() => props.editor_actions.restart?.()}
      >
        <Icon name="sync" />{" "}
        {labels ? <VisibleMDLG>Restart</VisibleMDLG> : undefined}
      </Button>
    );
  }

  function render_save(labels: boolean): Rendered {
    if (!is_visible("save", true)) {
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
    if ((x = render_chatgpt(labels))) v.push(x);
    if ((x = render_reload(labels))) v.push(x);
    if (v.length == 1) return v[0];
    if (v.length > 0) {
      return <ButtonGroup key={"save-group"}>{v}</ButtonGroup>;
    }
  }

  function render_rescan_latex_directives(): Rendered {
    if (!is_visible("rescan_latex_directive", true)) return;
    return (
      <Button
        key={"rescan-latex-directive"}
        disabled={!!props.status}
        bsSize={button_size()}
        onClick={() => props.editor_actions.rescan_latex_directive?.()}
        title={"Rescan document for build directive"}
      >
        <Icon name={"reload"} /> <VisibleMDLG>Directive</VisibleMDLG>
      </Button>
    );
  }

  function render_clean(labels): Rendered {
    if (!is_visible("clean", true)) {
      return;
    }
    return (
      <Button
        key={"clean"}
        bsSize={button_size()}
        onClick={() => props.actions.clean?.(props.id)}
        title={"Clean auxiliary build files"}
      >
        <Icon name={"trash"} />{" "}
        <VisibleMDLG>{labels ? "Clean" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  function render_count_words(): Rendered {
    if (!is_visible("word_count", true)) {
      return;
    }
    return (
      <Button
        key={"word_count"}
        bsSize={button_size()}
        onClick={() => props.actions.word_count?.(0, true)}
        title={"Runs texcount"}
      >
        <Icon name={"file-alt"} /> <VisibleMDLG>Count words</VisibleMDLG>
      </Button>
    );
  }

  function render_close_and_halt(labels: boolean): Rendered {
    if (!is_visible("close_and_halt")) {
      return;
    }
    return (
      <Button
        key={"close_and_halt"}
        disabled={close_and_halt_confirm}
        bsSize={button_size()}
        onClick={() => set_close_and_halt_confirm(true)}
        title={"Close and halt server"}
      >
        <Icon name={"PoweroffOutlined"} />{" "}
        <VisibleMDLG>{labels ? "Halt" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  function render_export_to_markdown(labels): Rendered {
    if (
      !is_visible("export_to_markdown") ||
      student_project_functionality.disableActions
    ) {
      return;
    }
    return (
      <Button
        key={"export"}
        bsSize={button_size()}
        onClick={() => props.editor_actions["export_to_markdown"]?.(props.id)}
        title={"Export to Markdown File..."}
      >
        <Icon name={"markdown"} />{" "}
        <VisibleMDLG>{labels ? "Export" : undefined}</VisibleMDLG>
      </Button>
    );
  }

  function render_edit(): Rendered {
    if (!is_visible("edit") || is_public) {
      return;
    }
    return (
      <Button
        key={"edit"}
        bsSize={button_size()}
        onClick={() => props.actions["edit"]?.(props.id)}
        title={"Click to edit file directly here"}
      >
        <Icon name={"lock"} /> <VisibleMDLG>Locked</VisibleMDLG>
      </Button>
    );
  }

  function render_readonly_view(): Rendered {
    if (!is_visible("readonly_view") || is_public) {
      return;
    }
    return (
      <Button
        key={"readonly-view"}
        bsSize={button_size()}
        onClick={() => props.actions["readonly_view"]?.(props.id)}
        title={"Click to switch to readonly view"}
      >
        <Icon name={"pencil"} /> <VisibleMDLG>Editable</VisibleMDLG>
      </Button>
    );
  }

  function renderFileMenu(): Rendered {
    if (isExplicitlyHidden("actions")) return;
    // We don't show this menu in kiosk mode, where none of the options make sense,
    // because they are all file management, which should be handled a different way.
    if (fullscreen == "kiosk") return;
    // Also, instructors can disable this for students:
    if (student_project_functionality.disableActions) return;
    const spec = props.editor_spec[props.type];
    if (spec != null && spec.hide_file_menu) return;
    return (
      <EditorFileInfoDropdown
        key={"info"}
        filename={props.path}
        project_id={props.project_id}
        is_public={false}
        style={MENU_STYLE}
      />
    );
  }

  function render_buttons(
    forceLabels?: boolean,
    style?: CSS,
    noRefs?,
  ): Rendered {
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
      let x;
      if ((x = render_tour(labels))) {
        v.push(x);
      }
      <div style={{ border: "1px solid #ccc", margin: "5px 0 5px 5px" }} />;
      v.push(renderFileMenu());
      v.push(renderEditMenu());
      v.push(renderViewMenu());
      <div style={{ border: "1px solid #ccc", margin: "5px 5px 5px 0px" }} />;
      v.push(render_save_timetravel_group(labels));
      v.push(render_edit());
      v.push(render_readonly_view());
      v.push(render_switch_to_file());
      v.push(render_clean(labels));
      v.push(render_rescan_latex_directives());
      v.push(render_restart(labels));
      v.push(render_close_and_halt(labels));
      v.push(render_download(labels));
      v.push(render_count_words());
      v.push(render_export_to_markdown(labels));

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

  function render_main_buttons(): Rendered {
    // This is complicated below (with the flex display) in order to have a drop down menu that actually appears
    // and *ALSO* have buttons that vanish when there are many of them.
    const style: CSS = {
      flexFlow: "row nowrap",
      display: "flex",
      flex: 1,
      whiteSpace: "nowrap",
      overflow: "hidden",
    };
    return <div style={style}>{render_buttons()}</div>;
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
            <div style={{ display: "flex", maxWidth: "100vw" }}>
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
              <div>{render_types()}</div>
              <Icon
                onClick={() => setShowMainButtonsPopover(false)}
                name="times"
                style={{
                  color: COLORS.GRAY_M,
                  marginTop: "10px",
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
              margin: "0 3px",
              height: props.is_only || props.is_full ? "34px" : "30px",
            }}
            onClick={() => setShowMainButtonsPopover(!showMainButtonsPopover)}
          >
            <Icon name="ellipsis" />
          </AntdButton>
        </div>
      </Popover>
    );
  }

  function render_connection_status(): Rendered | undefined {
    if (!props.connection_status || !is_visible("connection_status", true)) {
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
    if (!is_visible("compute_server") || !computeServersEnabled()) {
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

  function render_title(): Rendered {
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

  function render_close_and_halt_confirm(): Rendered {
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

  function render_confirm_bar(): Rendered {
    return (
      <div style={{ position: "relative" }}>
        {render_close_and_halt_confirm()}
      </div>
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

  // Whether this is *the* active currently focused frame:
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
        {render_title()}
        {render_main_buttons()}
        {render_connection_status()}
        {render_control()}
      </div>
      {render_confirm_bar()}
      {hasTour && props.is_visible && props.tab_is_visible && (
        <TitleBarTour refs={tourRefs} />
      )}
    </>
  );
};
