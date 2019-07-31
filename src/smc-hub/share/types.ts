export interface Database {
  synctable: Function;
  sha1: (...args) => string;
  _query: (opts: object) => void;
  get_usernames: (opts: object) => void;
}

export interface Logger {
  debug: Function;
  info: Function;
  warn: Function;
}
