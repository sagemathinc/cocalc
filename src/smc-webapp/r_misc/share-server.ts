/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is set to true when run from the share server.
In that case, all rendering of HTML must then be synchronous.
*/
export let SHARE_SERVER: boolean = false;

export function set_share_server(value: boolean): void {
  SHARE_SERVER = value;
}
