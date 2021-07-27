/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface User {
  account_id: string;
  first_name: string;
  last_name: string;
}

export interface PublicPath {
  id: string;
  path?: string;
  description?: string;
  last_edited?: number;
}

// This is because of Type error: 'types.ts' cannot be compiled under '--isolatedModules' because it is considered a
// global script file. Add an import, export, or an empty 'export {}' statement to make it a module.
export default {};
