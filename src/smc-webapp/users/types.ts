/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

export type UserMap = Map<string, any>; // TODO

export interface UsersState {
  user_map: UserMap;
}
