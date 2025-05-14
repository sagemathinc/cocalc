/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Add special commands and menus, typically for a specific type of functionality, e.g.,
Jupyter notebooks or text formatting.

This is basically a more user friendly and compact interface to the addMenus
and addCommands functions.
*/

import { IconRotation } from "@cocalc/frontend/components/icon";
import { IntlMessage } from "@cocalc/frontend/i18n";
import { capitalize } from "@cocalc/util/misc";
import { addCommands } from "./commands";
import { addMenus } from "./menus";
import type { Command, Menus } from "./types";

type Command0 = {
  icon?: string;
  iconRotate?: IconRotation;
  label?: string | (({ props }: any) => any) | IntlMessage;
  name?: string;
  children?;
  disabled?: ({ props }: { props: any }) => boolean;
};

type Menu = {
  label: string | IntlMessage;
  pos: number;
  entries: { [key: string]: (Partial<Command0> | string)[] | number | string };
};

type EditorMenus = {
  [key: string]: Menu;
};

export function addEditorMenus({
  prefix,
  editorMenus,
  getCommand,
}: {
  prefix: string;
  editorMenus: EditorMenus;
  getCommand: (name) => Partial<Command>;
}) {
  const MENUS: Menus = {};
  // Q: why do we pick only these properties?
  const COMMANDS: {
    [name: string]: Pick<
      Command,
      | "group"
      | "pos"
      | "children"
      | "label"
      | "icon"
      | "iconRotate"
      | "onClick"
      | "disabled"
    >;
  } = {};
  for (const menuName in editorMenus) {
    const menu = editorMenus[menuName];
    const groups: string[] = [];
    const { entries } = menu;
    for (const group in entries) {
      const data = entries[group];
      const gp = `${prefix}-${group}`;
      groups.push(gp);
      let pos = -1;
      for (const cmd of Object.values(data)) {
        pos += 1;
        if (typeof cmd == "string") {
          COMMANDS[cmd] = { group: gp, pos };
        } else {
          // custom -- could be submenu or dynamic based on props
          const { name } = cmd;
          if (name == null) {
            throw Error(
              `must explicitly specify name of command described by object -- ${JSON.stringify(
                cmd,
              )}`,
            );
          }
          COMMANDS[name] = {
            pos,
            ...cmd,
            group: gp,
          };
        }
      }
    }
    MENUS[menuName] = { label: menu.label, pos: menu.pos, groups };
  }

  // organization of the commands into groups
  addMenus(MENUS);

  const cmd = (name: string) => {
    if (typeof name != "string") {
      throw Error(`name must be a string, but it is ${JSON.stringify(name)}`);
    }
    let c = getCommand(name);
    if (!c) {
      throw Error(
        `command "${name}" not fully defined -- getCommand returned null`,
      );
    }
    if (!c.label) {
      c = { ...c, label: capitalize(name) };
    }
    const { children } = c;
    if (children != null) {
      let childCommands;
      if (typeof children == "function") {
        childCommands = children;
      } else {
        childCommands = [] as Partial<Command>[];
        for (const child of children) {
          // recursion!
          childCommands.push(typeof child == "string" ? cmd(child) : child);
        }
      }
      c = { ...c, children: childCommands };
    }
    return c;
  };

  // the commands
  const C: { [name: string]: Command } = {};
  const editorCommands = new Set<string>();
  for (const name in COMMANDS) {
    const { children } = COMMANDS[name];
    const cmdName = `${prefix}-${name}`;
    if (children == null) {
      // everything based entirely on spec object.
      C[cmdName] = {
        ...cmd(name),
        ...COMMANDS[name],
      } as Command;
    } else {
      let childCommands;
      if (typeof children == "function") {
        childCommands = children;
      } else {
        childCommands = [] as Partial<Command>[];
        for (const child of children) {
          childCommands.push(typeof child == "string" ? cmd(child) : child);
        }
      }
      C[cmdName] = {
        ...COMMANDS[name],
        children: childCommands,
      } as Command;
    }
    editorCommands.add(cmdName);
  }
  // console.log("adding commands", C);
  addCommands(C);

  return editorCommands;
}
