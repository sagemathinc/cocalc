export interface Options {
  // path -- the "original" path to the terminal, not the derived "term_path"
  path?: string;
  command?: string;
  args?: string[];
  env?: { [key: string]: string };
  // cwd -- if not set, the cwd is directory of "path"
  cwd?: string;
}

export interface Terminal {
  channel: any;
  history: string;
  client_sizes?: any;
  last_truncate_time: number;
  truncating: number;
  last_exit: number;
  options: Options;
  size?: any;
  term?: any; // node-pty
}
