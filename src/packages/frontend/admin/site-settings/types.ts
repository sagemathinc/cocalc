/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export type State = "view" | "load" | "edit" | "save" | "error";

export type Data = { [name: string]: string };

export type IsReadonly = { [name: string]: boolean };
