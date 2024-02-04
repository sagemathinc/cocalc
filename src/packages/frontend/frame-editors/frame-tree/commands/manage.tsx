import { COMMANDS } from "./commands";
import { GROUPS, MENUS } from "./menus";
import { APPLICATION_MENU, SEARCH_COMMANDS } from "./const";
import type { Command } from "./types";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { cmp, filename_extension, trunc_middle } from "@cocalc/util/misc";
import { Button, Tooltip } from "antd";
import { STAY_OPEN_ON_CLICK } from "@cocalc/frontend/components/dropdown-menu";
import type { MenuItem } from "@cocalc/frontend/components/dropdown-menu";
import { set_account_table } from "@cocalc/frontend/account/util";
import { redux } from "@cocalc/frontend/app-framework";
import { IS_MOBILE } from "@cocalc/frontend/feature";

const MAX_TITLE_WIDTH = 20;
const MAX_SEARCH_RESULTS = 10;
const ICON_WIDTH = "24px";

export class ManageCommands {
  readonly props;
  readonly studentProjectFunctionality;
  readonly setShowAI;
  readonly helpSearch: string;
  readonly setHelpSearch;
  readonly readOnly: boolean;
  readonly editorSettings;

  static allCommandPositions: { [name: string]: number } | null = null;

  constructor({
    props,
    studentProjectFunctionality,
    setShowAI,
    helpSearch,
    setHelpSearch,
    readOnly,
    editorSettings,
  }) {
    this.props = props;
    this.studentProjectFunctionality = studentProjectFunctionality;
    this.setShowAI = setShowAI;
    this.helpSearch = helpSearch;
    this.setHelpSearch = setHelpSearch;
    this.readOnly = readOnly;
    this.editorSettings = editorSettings;
  }

  isVisible = (name, cmd?) => {
    if (cmd == null) {
      cmd = COMMANDS[name];
    }
    // some buttons are always visible, e.g., for controlling the frame.
    if (cmd?.alwaysShow) {
      return true;
    }
    if (cmd?.disable && this.studentProjectFunctionality[cmd.disable]) {
      return false;
    }
    if (this.props.spec.commands?.[`-${name}`]) {
      // explicitly hidden by the spec
      return false;
    }
    if (cmd?.isVisible != null) {
      const { isVisible } = cmd;
      if (typeof isVisible == "string") {
        return !!this.props.spec.commands?.[isVisible];
      } else {
        return isVisible(this);
      }
    }
    // check editor spec for current editor:
    if (
      !this.props.spec.commands?.[name] &&
      !this.props.spec.customizeCommands?.[name]
    ) {
      // not in the spec
      return false;
    }

    return true;
  };

  isExplicitlyHidden = (name: string): boolean => {
    return !!this.props.spec.commands?.[`-${name}`];
  };

  matchesSearch = (cmd: Partial<Command>, name: string, search: string) => {
    if (COMMANDS[name] != null && !this.isVisible(name, cmd)) {
      return false;
    }
    if (!search) {
      return true;
    }
    if (name == SEARCH_COMMANDS) {
      return false;
    }
    const s = `${cmd.search ?? ""} ${cmd.title ?? ""} ${name} ${
      typeof cmd.label == "string" ? cmd.label : ""
    }`;
    return s.toLowerCase().includes(search);
  };

  searchCommands = (name: string, search: string) => {
    const cmd = this.getCommandInfo(name);
    const v: MenuItem[] = [];
    if (cmd == null) {
      return v;
    }
    const process = (cmd, name, parentLabel: JSX.Element | string) => {
      if (cmd.children) {
        const newParentLabel = (
          <div style={{ display: "flex" }}>
            {parentLabel}{" "}
            <Icon name="angle-right" style={{ margin: "0px 10px" }} />{" "}
            {this.getCommandLabel(cmd, name)}
          </div>
        );
        // recursively deal with any children (and children of children)
        for (const childCmd of this.getCommandChildren(cmd)) {
          process(childCmd, "", newParentLabel);
        }
        // never actually include cmd itself if it has children
        return;
      }
      if (this.matchesSearch(cmd, name, search)) {
        const item = this.commandToMenuItem({
          name,
          cmd,
          noChildren: true,
          key: name,
        });
        if (item != null) {
          item.label = (
            <div style={{ display: "flex" }}>
              {parentLabel}{" "}
              <Icon name="angle-right" style={{ margin: "0px 10px" }} />{" "}
              {item.label}
            </div>
          );
          v.push(item);
          if (v.length >= MAX_SEARCH_RESULTS) {
            return;
          }
        }
      }
    };
    // set it going
    process(cmd, name, this.getParentLabel(cmd));
    // return what we found in v
    return v;
  };

  applicationMenuTitle = () => {
    let title: string = "Application";
    let icon: IconName | undefined = undefined;
    if (this.props.editor_spec != null) {
      const spec = this.props.editor_spec[this.props.type];
      if (spec != null) {
        icon = spec.icon;
        if (spec.short) {
          title = spec.short;
        } else if (spec.name) {
          title = spec.name;
        }
      }
    }
    return (
      <span style={{ fontWeight: 450 }}>
        {icon && <Icon name={icon} style={{ marginRight: "5px" }} />}
        {trunc_middle(title, MAX_TITLE_WIDTH)}
      </span>
    );
  };

  getParentLabel = (cmd: Partial<Command>): JSX.Element | string => {
    const { group } = cmd;
    if (!group) {
      return "Menu";
    }
    for (const name in MENUS) {
      const { groups, label } = MENUS[name];
      if (groups.includes(group)) {
        if (label == APPLICATION_MENU) {
          return this.applicationMenuTitle();
        }
        return label;
      }
    }
    return "Menu";
  };

  getCommandInfo = (name: string): Command | null => {
    let cmd = COMMANDS[name];
    if (cmd == null) {
      throw Error(`unknown command '${name}'`);
    }
    const subs =
      this.props.editor_spec[this.props.type]?.customizeCommands?.[name ?? ""];
    if (subs != null) {
      cmd = { ...cmd, ...subs };
    }
    if (!this.isVisible(name, cmd)) {
      return null;
    }
    return cmd;
  };

  frameTypeCommands = (createNew: boolean) => {
    const selected_type: string = this.props.type;
    const items: Partial<Command>[] = [];
    for (const type in this.props.editor_spec) {
      const spec = this.props.editor_spec[type];
      if (spec == null) {
        // typescript should prevent this but, also double checking
        // makes this easier to debug.
        throw Error(
          `BUG -- ${type} must be defined by the editor_spec, but is not`,
        );
      }
      const search = spec.name?.toLowerCase();
      let label = spec.name;
      items.push({
        search,
        label: selected_type == type ? <b>{label}</b> : label,
        icon: spec.icon ? spec.icon : "file",
        onClick: () => {
          if (createNew) {
            this.props.actions.new_frame(type);
          } else {
            this.props.actions.set_frame_type(this.props.id, type);
          }
        },
      });
    }
    return items;
  };

  getCommandChildren = (cmd) => {
    if (cmd.children != null) {
      if (typeof cmd.children == "function") {
        return cmd.children(this);
      } else {
        return cmd.children;
      }
    } else {
      return null;
    }
  };

  private getCommandIcon = (cmd: Partial<Command>) => {
    let icon = cmd.icon;
    if (!icon) {
      return undefined;
    }
    if (typeof icon == "function") {
      icon = icon(this);
    }
    return (
      <span
        style={{
          width: ICON_WIDTH,
          height: ICON_WIDTH,
          display: "inline-block",
        }}
      >
        {typeof icon == "string" ? <Icon name={icon} /> : icon}
      </span>
    );
  };

  private getCommandLabel = (cmd: Partial<Command>, name: string) => {
    const width = ICON_WIDTH;
    const lbl = typeof cmd.label == "function" ? cmd.label(this) : cmd.label;
    let icon;
    if (!name || !this.editorSettings.get("extra_button_bar")) {
      // do not show toggleable icon if no command name (so not top level)
      // or the button bar is completely disabled (i.e. user doesn't
      // want it at all).
      icon = (
        <div style={{ width, marginRight: "10px", display: "inline-block" }}>
          {this.getCommandIcon(cmd)}
        </div>
      );
    } else {
      const isOnButtonBar = this.isOnButtonBar(name);
      icon = cmd.icon ? (
        <Tooltip
          title={
            isOnButtonBar
              ? "Click icon to remove from toolbar"
              : "Click icon to add to toolbar"
          }
          placement="top"
        >
          <Button
            type="text"
            style={{
              width,
              height: width,
              display: "inline-block",
              padding: 0,
              marginRight: "10px",
              background: isOnButtonBar ? "#ddd" : undefined,
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleButton(name);
            }}
          >
            {this.getCommandIcon(cmd)}
          </Button>
        </Tooltip>
      ) : (
        <div
          style={{ width, marginRight: "10px", display: "inline-block" }}
        ></div>
      );
    }
    return (
      <>
        {icon}
        {lbl}
      </>
    );
  };

  button = (name: string) => {
    const cmd = this.getCommandInfo(name);
    if (cmd == null) {
      return null;
    }
    return this.commandToMenuItem({
      name,
      cmd,
      key: name,
      noChildren: false,
      button: true,
    });
  };

  menuItem = (name: string) => {
    const cmd = this.getCommandInfo(name);
    if (cmd == null) {
      return null;
    }

    return this.commandToMenuItem({
      name,
      cmd,
      key: name,
      noChildren: false,
    });
  };

  commandToMenuItem = ({
    name = "",
    key,
    cmd,
    noChildren,
    button,
  }: {
    name?: string;
    key: string;
    cmd: Partial<Command>;
    noChildren: boolean;
    button?: boolean;
  }) => {
    // it's an action defined by the name of that action, so visible
    // only if that function is defined.
    if (
      name &&
      this.props.editor_actions[name] == null &&
      cmd?.onClick == null &&
      cmd?.children == null
    ) {
      // action not defined, so only chance is if onClick is defined
      // but it isn't
      return null;
    }
    let label;
    if (button) {
      const icon = this.getCommandIcon(cmd);
      let buttonLabel;
      if (cmd.button != null) {
        buttonLabel =
          typeof cmd.button == "function" ? cmd.button(this) : cmd.button;
      } else {
        buttonLabel =
          typeof cmd.label == "function" ? cmd.label(this) : cmd.label;
      }
      label = (
        <>
          {icon ?? <Icon name="square" />}
          <div
            style={{
              fontSize: "10px",
              color: "#666",
              marginTop: "-5px",
              // special case: button='' explicitly means no label
              width: cmd.button === "" ? undefined : "46px",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {buttonLabel}
          </div>
        </>
      );
    } else {
      label = this.getCommandLabel(cmd, name);
    }
    const children = noChildren
      ? undefined
      : this.getCommandChildren(cmd)?.map((x, i) =>
          this.commandToMenuItem({
            cmd: x,
            key: `${key}-${i}-${x.stayOpenOnClick ? STAY_OPEN_ON_CLICK : ""}`,
            noChildren,
          }),
        );
    if (button) {
      label = (
        <Tooltip
          placement={children != null ? "top" : "bottom"}
          title={() => {
            return (
              <>
                {this.getCommandLabel(cmd, name)}
                {cmd.title ? <div>{cmd.title}</div> : undefined}
              </>
            );
          }}
        >
          {label}
        </Tooltip>
      );
    } else if (cmd.title) {
      label = (
        <Tooltip
          title={cmd.title}
          placement={children != null ? "top" : "right"}
        >
          {label}
        </Tooltip>
      );
    }
    const onClick = async (event) => {
      let { popconfirm } = cmd;
      if (popconfirm != null) {
        if (typeof popconfirm == "function") {
          popconfirm = popconfirm(this);
        }
        if (popconfirm != null) {
          if (!(await redux.getActions("page").popconfirm(popconfirm))) {
            return;
          }
        }
      }
      try {
        if (cmd.onClick != null) {
          await cmd.onClick?.({
            ...this,
            event,
          });
        } else {
          // common special case default
          await this.props.actions[name]?.(this.props.id);
        }
      } catch (err) {
        this.props.actions.set_error(`${err}`);
      }
    };
    if (!button && cmd.keyboard && !IS_MOBILE) {
      label = (
        <div style={{ display: "flex" }}>
          {label}
          <div
            style={{
              flex: 1,
              color: "#666",
              textAlign: "right",
              marginLeft: "50px",
            }}
          >
            {cmd.keyboard}
          </div>
        </div>
      );
    }
    // TODO: handle when cmd.confirm is defined.
    return {
      disabled: cmd.disabled?.(this),
      label,
      onClick,
      key: cmd.stayOpenOnClick ? `${key}-${STAY_OPEN_ON_CLICK}` : key,
      children,
    };
  };

  // editorType = string that identifies this editor frame type for this type of file.
  // This *should* be a little more subtle than just using the filename extension.
  //
  private editorType = () => {
    return `${filename_extension(this.props.path)}-${this.props.type}`;
  };

  private isOnButtonBar = (name) => {
    return (
      this.editorSettings.getIn(["buttons", this.editorType(), name]) ??
      this.props.spec.buttons?.[name]
    );
  };

  private toggleButton = (name) => {
    const buttons = this.editorSettings.get("buttons")?.toJS() ?? {};
    const type = this.editorType();
    if (buttons[type] == null) {
      buttons[type] = {};
    }
    buttons[type][name] = !this.isOnButtonBar(name);
    set_account_table({ editor_settings: { buttons } });
  };

  removeAllToolbarButtons = () => {
    const type = this.editorType();
    set_account_table({
      editor_settings: { buttons: { [type]: null } },
    });
    const buttons = this.props.spec.buttons;
    if (buttons == null) {
      return;
    }
    const x: { [name: string]: false } = {};
    for (const name in buttons) {
      x[name] = false;
    }
    set_account_table({
      editor_settings: { buttons: { [type]: x } },
    });
  };

  resetToolbar = () => {
    const type = this.editorType();
    // it is a deep merge:
    set_account_table({
      editor_settings: { buttons: { [type]: null } },
    });
  };

  // returns the names in order of the button toolbar buttons
  // that should be visible
  getToolbarButtons = (): string[] => {
    const w: string[] = [];
    const customButtons = this.editorSettings.getIn([
      "buttons",
      this.editorType(),
    ]);
    let custom;
    if (customButtons != null) {
      custom = customButtons.toJS();
      for (const name in custom) {
        if (custom[name]) {
          w.push(name);
        }
      }
    } else {
      custom = {};
    }
    //     if (custom["toggle_button_bar"] == null) {
    //       // special case -- include this unless it is explicitly added or removed
    //       w.push("toggle_button_bar");
    //     }
    const s = new Set(w);
    if (this.props.spec.buttons != null) {
      // add in buttons that are the default for this specific editor.
      for (const name in this.props.spec.buttons) {
        if (
          !s.has(name) &&
          custom[name] == null &&
          this.props.spec.buttons[name]
        ) {
          w.push(name);
        }
      }
    }
    //     if (w.length == 1 && w[0] == "toggle_button_bar") {
    //       // special case -- don't *ONLY* show this toggle button.
    //       return [];
    //     }

    // TODO: sort w.
    const positions = this.getAllCommandPositions();
    w.sort((a, b) => cmp(positions[a] ?? 0, positions[b] ?? 0));
    return w;
  };

  // used for sorting
  private getAllCommandPositions = () => {
    if (ManageCommands.allCommandPositions != null) {
      return ManageCommands.allCommandPositions;
    }
    let v: { name: string; menu: number; pos: number }[] = [];
    for (const menuName in MENUS) {
      const { pos: menuPos, groups } = MENUS[menuName];
      for (const group of groups) {
        const w: { name: string; menu: number; pos: number }[] = [];
        for (const commandName of GROUPS[group]) {
          w.push({
            name: commandName,
            menu: menuPos,
            pos: COMMANDS[commandName].pos ?? 1e6,
          });
        }
        // local sort on position in the group
        w.sort((x, y) => cmp(x.pos, y.pos));
        v = v.concat(w);
      }
    }
    // globally sort on the menu they are in
    v.sort((x, y) => {
      const c = cmp(x.menu, y.menu);
      if (c) {
        return c;
      }
      return 0;
    });
    //     v.sort((x, y) => {
    //       const c = cmp(x.menu, y.menu);
    //       if (c) {
    //         return c;
    //       }
    //       return cmp(x.pos, y.pos);
    //     });
    ManageCommands.allCommandPositions = {};
    let i = 0;
    for (const { name } of v) {
      ManageCommands.allCommandPositions[name] = i++;
    }
    return ManageCommands.allCommandPositions;
  };
}
