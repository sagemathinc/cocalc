/*
Add special commands and menus, typically for a specific type of functionality, e.g.,
Jupyter notebooks or text formatting.

This is basically a more user friendly and compact interface to the addMenus
and addCommands functions.
*/

import { addCommands } from "./commands";
import { addMenus } from "./menus";
import type { Command, Menus } from "./types";
import { capitalize } from "@cocalc/util/misc";

type Command0 = {
  icon?: string;
  label?: string | (({ props }: any) => any);
  name?: string;
  children?;
  disabled?: ({ props }: { props: any }) => boolean;
};

type Menu = {
  label: string;
  pos: number;
  [key: string]: (Partial<Command0> | string)[] | number | string;
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
  const COMMANDS: {
    [name: string]: {
      group: string;
      pos: number;
      children?;
      label?;
      icon?;
      onClick?;
      disabled?;
    };
  } = {};
  for (const menuName in editorMenus) {
    const menu = editorMenus[menuName];
    const groups: string[] = [];
    for (const group in menu) {
      const data = menu[group];
      if (typeof data == "string" || typeof data == "number") {
        // label and pos
        continue;
      }
      const gp = `${prefix}-${group}`;
      groups.push(gp);
      let pos = -1;
      for (const cmd of data) {
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
      console.log("sub in ", name, c);
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
    if (name == "setcolor" || name == "unformat") {
      console.log(name, COMMANDS[name]);
    }
    const { children } = COMMANDS[name];
    const cmdName = `${prefix}-${name}`;
    if (children == null) {
      // everthing based entirely on spec object.
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
