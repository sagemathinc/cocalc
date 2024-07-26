/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export type State = "load" | "edit" | "save" | "error";

export type Data = { [name: string]: string };

export type IsReadonly = { [name: string]: boolean };
