/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";
import { State, Token } from "./types";

type Handler = (opts: { token: Token; state: State }) => Node[] | undefined;

export const handlers: Handler[] = [];

export function register(handler: Handler): void {
  handlers.push(handler);
}
