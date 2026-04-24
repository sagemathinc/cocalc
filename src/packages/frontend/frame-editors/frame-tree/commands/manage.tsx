/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";
import { ReactNode } from "react";
import { IntlShape } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import type { MenuItem } from "@cocalc/frontend/components/dropdown-menu";
import { STAY_OPEN_ON_CLICK } from "@cocalc/frontend/components/dropdown-menu";
import {
  Icon,
  type IconRef,
  isIconName,
  isIconRefObject,
} from "@cocalc/frontend/components/icon";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { IntlMessage, isIntlMessage } from "@cocalc/frontend/i18n";
import { cmp, trunc_middle } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import {
  EditorDescription,
  getEditorDescription,
  getEditorDescriptions,
} from "../types";
import { COMMANDS } from "./commands";
import { APPLICATION_MENU, SEARCH_COMMANDS } from "./const";
import { GROUPS, MENUS } from "./menus";
import type { Command } from "./types";

const MAX_TITLE_WIDTH = 20;
const MAX_SEARCH_RESULTS = 10;
const ICON_WIDTH = "28px";

export class ManageCommands {
  // TODO: setting this to FrameTitleBarProps causes type issues in frame-editors/jupyter-editor/editor.ts
  // So, there is probably a fundamental problem with that mapping into "AllActions"
  readonly props; // FrameTitleBarProps;
  readonly studentProjectFunctionality;
  readonly setShowAI: (val: boolean) => void;
  readonly setShowNewAI: (val: boolean) => void;
  readonly helpSearch: string;
  readonly setHelpSearch;
  readonly readOnly: boolean;
  readonly editorSettings;
  readonly frameEditorName: string;
  readonly toolbarButtons: string[] | null;
  readonly setToolbarButtons: (value: string[] | null) => void;
  readonly intl: IntlShape;
  readonly formatMessageValues: Parameters<typeof this.intl.formatMessage>[1];

  static allCommandPositions: { [name: string]: number } | null = null;

  constructor({
    props,
    studentProjectFunctionality,
    setShowAI,
    setShowNewAI,
    helpSearch,
    setHelpSearch,
    readOnly,
    editorSettings,
    frameEditorName,
    toolbarButtons,
    setToolbarButtons,
    intl,
  }) {
    this.props = props;
    this.studentProjectFunctionality = studentProjectFunctionality;
    this.setShowAI = setShowAI;
    this.setShowNewAI = setShowNewAI;
    this.helpSearch = helpSearch;
    this.setHelpSearch = setHelpSearch;
    this.readOnly = readOnly;
    this.editorSettings = editorSettings;
    this.frameEditorName = frameEditorName;
    this.toolbarButtons = toolbarButtons;
    this.setToolbarButtons = setToolbarButtons;
    this.intl = intl;
    this.formatMessageValues = { br: <br /> };
    //window.x = { manage: this };
  }

  isVisible = (name, cmd?) => {
    if (cmd == null) {
      cmd = COMMANDS[name];
    }
    if (this.props.spec.commands?.[`-${name}`]) {
      // explicitly hidden by the spec
      return false;
    }
    // some buttons are always visible, e.g., for controlling the frame, unless of course they are explicitly
    // hidden by the spec (above)
    if (cmd?.alwaysShow) {
      return true;
    }
    if (cmd?.neverVisibleOnMobile && IS_MOBILE) {
      // never show on mobile
      return false;
    }
    if (cmd?.disable && this.studentProjectFunctionality[cmd.disable]) {
      return false;
    }
    if (cmd?.isVisible != null) {
      const { isVisible } = cmd;
      if (typeof isVisible === "string") {
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
    const process = (cmd, name, parentLabel: React.JSX.Element | string) => {
      if (cmd.children) {
        const newParentLabel = (
          <div style={{ display: "flex" }}>
            {parentLabel}{" "}
            <Icon name="angle-right" style={{ margin: "0px 10px" }} />{" "}
            {this.getCommandLabel(cmd, name, true)}
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

  spec2display = (
    spec: EditorDescription,
    aspect: "name" | "short",
  ): string => {
    const label: string | IntlMessage | undefined = spec[aspect];
    if (isIntlMessage(label)) {
      return this.intl.formatMessage(label);
    } else if (typeof label === "string") {
      return label;
    }
    return "";
  };

  applicationMenuTitle = () => {
    let title: string = "Application";
    let icon: IconRef | undefined = undefined;
    if (this.props.editor_spec != null) {
      const spec = getEditorDescription(
        this.props.editor_spec,
        this.props.type,
      );
      if (spec != null) {
        icon = spec.icon;
        if (spec.short) {
          title = this.spec2display(spec, "short");
        } else if (spec.name) {
          title = this.spec2display(spec, "name");
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

  getParentLabel = (cmd: Partial<Command>): React.JSX.Element | string => {
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

        if (isIntlMessage(label)) {
          return this.intl.formatMessage(label);
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
    const subs = getEditorDescription(this.props.editor_spec, this.props.type)
      ?.customizeCommands?.[name ?? ""];
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
    for (const spec of getEditorDescriptions(this.props.editor_spec)) {
      const type = spec.type;
      if (spec == null) {
        // typescript should prevent this but, also double checking
        // makes this easier to debug.
        throw Error(
          `BUG -- ${type} must be defined by the editor_spec, but is not`,
        );
      }
      const label = this.spec2display(spec, "name");
      const search = label.toLowerCase();
      items.push({
        search,
        label: selected_type === type ? <b>{label}</b> : label,
        icon: <Icon name={spec.icon ?? "file"} />,
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
      if (typeof cmd.children === "function") {
        return cmd.children(this);
      } else {
        return cmd.children;
      }
    } else {
      return null;
    }
  };

  // Resolve a possibly compound key like "format-font/bold" into the
  // child command object.  For simple keys (no "/"), returns null so
  // callers fall back to normal lookup via getCommandInfo.
  resolveCompoundCommand = (compoundKey: string): Partial<Command> | null => {
    const i = compoundKey.indexOf("/");
    if (i === -1) {
      return null;
    }
    const parentName = compoundKey.slice(0, i);
    const childName = compoundKey.slice(i + 1);
    const parentCmd = COMMANDS[parentName];
    if (parentCmd == null) {
      return null;
    }
    const children = this.getCommandChildren(parentCmd);
    if (children == null) {
      return null;
    }
    return children.find((c) => c.name === childName) ?? null;
  };

  private getCommandIcon = (cmd: Partial<Command>) => {
    const rotate = cmd.iconRotate;
    let icon = cmd.icon;
    if (!icon) {
      return undefined;
    }
    if (typeof icon === "function") {
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
        {isIconName(icon) || isIconRefObject(icon) ? (
          <Icon name={icon} rotate={rotate} />
        ) : (
          icon
        )}
      </span>
    );
  };

  private commandToDisplay = (
    cmd: Partial<Command>,
    aspect: "label" | "title" | "button",
  ): string | null | undefined | ReactNode => {
    if (cmd == null) return;
    const data = cmd[aspect];
    if (data == null) return;

    if (typeof data === "string") {
      return data;
    }

    if (typeof data === "function") {
      const result = data(this);
      // Check if the function returned an IntlMessage
      if (isIntlMessage(result)) {
        return this.intl.formatMessage(result, this.formatMessageValues);
      }
      return result;
    }

    // react-intl defineMessage object
    if (isIntlMessage(data)) {
      return this.intl.formatMessage(data, this.formatMessageValues);
    }

    if (typeof data === "boolean" || typeof data === "number") {
      return `${data}`;
    }

    // what's left should be a ReactNode
    return data;
  };

  private getCommandLabel = (
    cmd: Partial<Command>,
    name: string,
    tip: boolean,
  ) => {
    const width = ICON_WIDTH;
    let lbl = this.commandToDisplay(cmd, "label");
    if (tip && cmd.title) {
      const title = this.commandToDisplay(cmd, "title");
      lbl = (
        <Tooltip mouseEnterDelay={0.9} title={title} placement={"left"}>
          {lbl}
        </Tooltip>
      );
    }
    let icon;
    if (!name || !this.editorSettings.get("extra_button_bar")) {
      // do not show toggleable icon if no command name (unnamed submenu
      // children can't be pinned) or the button bar is completely
      // disabled (i.e. user doesn't want it at all).
      icon = (
        <div style={{ width, marginRight: "10px", display: "inline-block" }}>
          {this.getCommandIcon(cmd)}
        </div>
      );
    } else {
      const isOnButtonBar = this.isOnButtonBar(name);
      icon = cmd.icon ? (
        <Tooltip
          title={this.intl.formatMessage(
            {
              id: "frame-editors.frame-tree.add_remove_icon_button_bar.tooltip",
              defaultMessage: `{isOnButtonBar, select,
                true {Click icon to remove from toolbar}
                other {Click icon to add to toolbar}}`,
            },
            { isOnButtonBar },
          )}
          placement="left"
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
    // Handle compound keys like "format-font/bold" for pinned submenu items
    const childCmd = this.resolveCompoundCommand(name);
    if (childCmd != null) {
      return this.commandToMenuItem({
        name,
        cmd: childCmd,
        key: name,
        noChildren: true,
        button: true,
      });
    }
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

  showSymbolBarLabels = (): boolean => {
    const account = redux.getStore("account");
    return account.showSymbolBarLabels();
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
        buttonLabel = this.commandToDisplay(cmd, "button");
      } else {
        buttonLabel = this.commandToDisplay(cmd, "label");
      }
      label = (
        <>
          {icon ?? <Icon name="square" />}
          {this.showSymbolBarLabels() && (
            <div
              style={{
                fontSize: "11px",
                color: COLORS.GRAY_M,
                marginTop: "-10px",
                // special case: button='' explicitly means no label
                width: cmd.button === "" ? undefined : "50px",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {buttonLabel}
            </div>
          )}
        </>
      );
    } else {
      label = this.getCommandLabel(cmd, name, true);
    }
    const children = noChildren
      ? undefined
      : this.getCommandChildren(cmd)?.map((x, i) =>
          this.commandToMenuItem({
            // If the child has a name and this is a top-level command (name is set),
            // construct a compound key "parent/child" so the pin toggle works for
            // submenu items.
            name: x.name && name ? `${name}/${x.name}` : "",
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
                {this.getCommandLabel(cmd, name, false)}
                {cmd.title ? (
                  <div>{this.commandToDisplay(cmd, "title")}</div>
                ) : undefined}
              </>
            );
          }}
        >
          {label}
        </Tooltip>
      );
    }
    const onClick = async (event) => {
      let { popconfirm } = cmd;
      if (popconfirm != null) {
        if (typeof popconfirm === "function") {
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
        <div style={{ display: "flex", width: "100%" }}>
          {label}
          <div
            style={{
              flex: 1,
              color: "#999",
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
      disabled: cmd.disabled?.(this) || allChildrenAreDisabled(children),
      label,
      onClick,
      key: cmd.stayOpenOnClick ? `${key}-${STAY_OPEN_ON_CLICK}` : key,
      children,
    };
  };

  private getDefaultToolbarButtons = (): string[] => {
    const buttons = this.props.spec.buttons;
    if (buttons == null) {
      return [];
    }
    const v: string[] = [];
    for (const name in buttons) {
      if (buttons[name]) {
        v.push(name);
      }
    }
    return this.sortToolbarButtons(v);
  };

  private getToolbarButtonPosition = (
    key: string,
    positions = this.getAllCommandPositions(),
  ): number => {
    if (positions[key] != null) return positions[key];
    const slashIdx = key.indexOf("/");
    if (slashIdx !== -1) {
      const parentName = key.slice(0, slashIdx);
      const childName = key.slice(slashIdx + 1);
      const base = positions[parentName] ?? 0;
      const parentCmd = COMMANDS[parentName];
      if (parentCmd != null) {
        const children = this.getCommandChildren(parentCmd);
        if (children != null) {
          const idx = children.findIndex((c) => c.name === childName);
          if (idx !== -1) {
            return base + (idx + 1) / (children.length + 1);
          }
        }
      }
      return base;
    }
    return 0;
  };

  private sortToolbarButtons = (buttons: string[]): string[] => {
    const positions = this.getAllCommandPositions();
    return [...buttons].sort((a, b) =>
      cmp(
        this.getToolbarButtonPosition(a, positions),
        this.getToolbarButtonPosition(b, positions),
      ),
    );
  };

  private getCustomToolbarButtons = (): string[] | null => {
    return this.toolbarButtons;
  };

  private isOnButtonBar = (name) => {
    const customButtons = this.getCustomToolbarButtons();
    if (customButtons != null) {
      return customButtons.includes(name);
    }
    return this.props.spec.buttons?.[name] ?? false;
  };

  private toggleButton = (name) => {
    const current = this.getToolbarButtons();
    if (current.includes(name)) {
      this.setToolbarButtons(current.filter((item) => item !== name));
    } else {
      this.setToolbarButtons(current.concat([name]));
    }
  };

  removeToolbarButton = (name: string) => {
    const current = this.getToolbarButtons();
    if (!current.includes(name)) {
      return;
    }
    this.setToolbarButtons(current.filter((item) => item !== name));
  };

  removeAllToolbarButtons = () => {
    this.setToolbarButtons([]);
  };

  resetToolbar = () => {
    this.setToolbarButtons(null);
  };

  // returns the names in order of the button toolbar buttons
  // that should be visible
  getToolbarButtons = (): string[] => {
    const customButtons = this.getCustomToolbarButtons();
    if (customButtons != null) {
      return customButtons;
    }
    return this.getDefaultToolbarButtons();
  };

  getToolbarOrder = (): string[] | null => {
    return this.getCustomToolbarButtons();
  };

  setToolbarOrder = (order: string[]) => {
    this.setToolbarButtons(order);
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

function allChildrenAreDisabled(children) {
  if (children == null || children.length == 0) {
    return false;
  }
  for (const child of children) {
    if (!child.disabled) {
      return false;
    }
  }
  return true;
}
