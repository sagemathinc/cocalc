/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// used by frontend and project backend

export const NAMED_SERVER_NAMES = [
  "jupyter",
  "jupyterlab",
  "code",
  "pluto",
  "rserver",
  "xpra",
] as const;

export type NamedServerName = (typeof NAMED_SERVER_NAMES)[number];
