/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface Channel {
  write(x: any): boolean;
  on(event: string, f: Function): void;
  end(): void;
  close(): void;
  connect(): void;
  conn: any;
  channel: string;
}
