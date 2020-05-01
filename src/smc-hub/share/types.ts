/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
