/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface Author {
  name: string;
  account_id: string;
}

export type IsPublicFunction = (project_id: string, path: string) => boolean;
