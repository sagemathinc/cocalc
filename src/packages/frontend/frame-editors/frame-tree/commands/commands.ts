import type { Command } from "./types";
import { addCommandsToMenus } from "./menus";

export const COMMANDS: { [command: string]: Command } = {};

export function addCommands(commands: { [command: string]: Command }) {
  for (const command in commands) {
    if (COMMANDS[command] != null) {
      //throw Error(`command ${command} is already defined`);
      console.warn(`command ${command} is already defined`);
    }
    COMMANDS[command] = commands[command];
  }
  addCommandsToMenus(commands);
}
