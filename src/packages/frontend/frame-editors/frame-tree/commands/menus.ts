/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { Command, Menus } from "./types";

export const MENUS: Menus = {};

export const GROUPS: { [group: string]: string[] } = {};

export function addMenus(menus: Menus) {
  for (const name in menus) {
    const { label, pos, groups } = menus[name];
    for (const group of groups) {
      if (GROUPS[group] != null) {
        // it's already there
        //throw Error(`group ${group} already exists`);
        console.warn(`group ${group} already exists`);
      }
      GROUPS[group] = [];
      if (MENUS[name] == null) {
        MENUS[name] = { label, pos, groups: [] };
      } else {
        if (MENUS[name].pos != pos) {
          throw Error(`attempt to change position of menu "${name}"`);
        }
      }
      // console.log(`adding ${group} to ${JSON.stringify(MENUS[name].groups)}`);
      if (!MENUS[name].groups.includes(group)) {
        MENUS[name].groups.push(group);
      }
    }
  }
}

export function addCommandsToMenus(commands: { [command: string]: Command }) {
  for (const name in commands) {
    const command = commands[name];
    const { group } = command;
    if (group != null) {
      const v = GROUPS[group];
      if (v == null) {
        // throw Error(`command ${name} in unknown group '${group}'`);
        console.warn(`command ${name} in unknown group '${group}'`);
        continue;
      }
      if (v.includes(name)) {
        continue;
      }
      v.push(name);
    }
  }
}
