/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { createTypedMap, TypedMap } from "@cocalc/frontend/app-framework";
import { ExecOutput } from "@cocalc/frontend/frame-editors/generic/client";
import { IProcessedLatexLog } from "./latex-log-parser";

export type BuildLog = ExecOutput & {
  parse?: IProcessedLatexLog;
};

export type BuildLogs = Map<string, Map<string, any>>;

interface ScrollIntoViewParams {
  page: number;
  y: number;
  id: string;
}

export const ScrollIntoViewRecord = createTypedMap<ScrollIntoViewParams>();
export type ScrollIntoViewMap = TypedMap<ScrollIntoViewParams>;
