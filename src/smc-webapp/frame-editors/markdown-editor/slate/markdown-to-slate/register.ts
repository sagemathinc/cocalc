/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Descendant } from "slate";
import { State, Token } from "./types";
import { Options } from "./parse";

type Handler = (opts: {
  token: Token;
  state: State;
  options?: Options;
}) => Descendant[] | undefined;

export const handlers: Handler[] = [];

export function register(handler: Handler): void {
  handlers.push(handler);
}
