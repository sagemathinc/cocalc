/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap, createTypedMap } from "./app-framework/TypedMap";

// This file lists entities that still need to be well typed.
export type ProjectsActions = any;

export type ProjectMap = Map<any, any>;

export const ProjectStatus = createTypedMap<ProjectStatus>();
export type ProjectStatus = TypedMap<{
  state: "running" | "saving" | "opened" | "closed" | "archived";
}>;

export type UserMap = Map<any, any>;

export type StripeCustomer = TypedMap<{}>;
export type Customer = TypedMap<{}>;
