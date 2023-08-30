import type { EventEmitter } from "events";
import Primus from "primus";

export interface Options {
  // path -- the "original" path to the terminal, not the derived "term_path"
  path?: string;
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  // cwd -- if not set, the cwd is directory of "path"
  cwd?: string;
}

export interface PrimusChannel extends EventEmitter {
  write: (data: object | string) => void;
  forEach: (cb: (spark, id, connections) => void) => void;
}

export interface PrimusWithChannels extends Primus {
  channel: (name: string) => PrimusChannel;
}

interface SizeClientCommand {
  cmd: "size";
  rows: number;
  cols: number;
}

interface SetClientCommand {
  cmd: "set_command";
  command: string;
  args: string[];
}

interface KillClientCommand {
  cmd: "kill";
}

interface CWDClientCommand {
  cmd: "cwd";
}

interface BootClientCommand {
  cmd: "boot";
}

export type ClientCommand =
  | SizeClientCommand
  | SetClientCommand
  | KillClientCommand
  | CWDClientCommand
  | BootClientCommand;
