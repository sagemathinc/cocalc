/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export class BrowserClient {
  private conn: any;
  private logger: any;

  constructor(conn, logger) {
    this.conn = conn;
    this.logger = logger;
  }
}
