import { COMMANDS } from "./commands";
import { MENUS } from "./menus";
import { APPLICATION_MENU, SEARCH_COMMANDS } from "./const";
import type { Command } from "./types";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { trunc_middle } from "@cocalc/util/misc";
import { Button, Tooltip } from "antd";
import { STAY_OPEN_ON_CLICK } from "@cocalc/frontend/components/dropdown-menu";
import type { MenuItem } from "@cocalc/frontend/components/dropdown-menu";

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

  constructor({
    props,
    studentProjectFunctionality,
    setShowAI,
    helpSearch,
    setHelpSearch,
    readOnly,
  }) {
    this.props = props;
    this.studentProjectFunctionality = studentProjectFunctionality;
    this.setShowAI = setShowAI;
    this.helpSearch = helpSearch;
    this.setHelpSearch = setHelpSearch;
    this.readOnly = readOnly;
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
        isVisible(this);
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

  frameTypeCommands = () => {
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
        onClick: () => this.props.actions.set_frame_type(this.props.id, type),
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
    return (
      <>
        {cmd.icon ? (
          <Tooltip title={"Click icon to toggle button"} placement="left">
            <Button
              type="text"
              style={{
                width,
                height: width,
                display: "inline-block",
                padding: 0,
                marginRight: "10px",
                background: ["save", "time_travel", "chatgpt"].includes(name)
                  ? "#ddd"
                  : undefined,
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {this.getCommandIcon(cmd)}
            </Button>
          </Tooltip>
        ) : (
          <div
            style={{ width, marginRight: "10px", display: "inline-block" }}
          ></div>
        )}
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
      iconOnly: true,
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
    iconOnly,
  }: {
    name?: string;
    key: string;
    cmd: Partial<Command>;
    noChildren: boolean;
    iconOnly?: boolean;
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
    if (iconOnly) {
      label = this.getCommandIcon(cmd);
      if (label == null) {
        label = typeof cmd.label == "function" ? cmd.label(this) : cmd.label;
      }
    } else {
      label = this.getCommandLabel(cmd, name);
    }
    if (cmd.title) {
      label = (
        <Tooltip mouseEnterDelay={0.9} title={cmd.title}>
          {label}
        </Tooltip>
      );
    }
    const onClick = async (event) => {
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
    if (!iconOnly && cmd.keyboard) {
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
      children: noChildren
        ? undefined
        : this.getCommandChildren(cmd)?.map((x, i) =>
            this.commandToMenuItem({
              cmd: x,
              key: `${key}-${i}-${x.stayOpenOnClick ? STAY_OPEN_ON_CLICK : ""}`,
              noChildren,
            }),
          ),
    };
  };
}
