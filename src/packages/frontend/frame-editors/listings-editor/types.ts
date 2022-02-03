/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

export interface Fav {
  time?:  number;
  comment?: string; // optional str data patch/merge via diff string
}

export type FavMap = TypedMap<Fav>;

// Tasks is an immutable map from id to Element as a map.
export type Favs = Map<string, FavMap>;
