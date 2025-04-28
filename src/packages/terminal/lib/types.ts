import type { EventEmitter } from "events";
import Primus from "primus";
import type { Spark } from "primus";
import type { IPty as IPty0 } from "@lydell/node-pty";

// upstream typings not quite right
export interface IPty extends IPty0 {
  destroy: () => void;
}

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
  destroy: () => void;
  // createSpark is not on the real PrimusChannel, but it's part of our mock version for
  // unit testing in support.ts
  createSpark: (address: string) => Spark;
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
