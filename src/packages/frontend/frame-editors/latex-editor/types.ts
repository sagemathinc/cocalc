/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { createTypedMap, TypedMap } from "@cocalc/frontend/app-framework";
import { IconName } from "@cocalc/frontend/components";
import type { ExecOutput } from "@cocalc/util/db-schema/projects";
import { IProcessedLatexLog } from "./latex-log-parser";

interface IBuildSpec {
  button: boolean;
  label: string;
  icon: IconName;
  tip: string;
}

export interface IBuildSpecs {
  build: IBuildSpec;
  latex: IBuildSpec;
  bibtex: IBuildSpec;
  sagetex: IBuildSpec;
  pythontex: IBuildSpec;
  knitr: IBuildSpec;
  clean: IBuildSpec;
}

export type BuildLog = ExecOutput & {
  parse?: IProcessedLatexLog;
  output?: string; // used in run_clean
};

export type BuildLogs = Map<string, TypedMap<BuildLog>>;

interface ScrollIntoViewParams {
  page: number;
  y: number;
  id: string;
}

export const ScrollIntoViewRecord = createTypedMap<ScrollIntoViewParams>();
export type ScrollIntoViewMap = TypedMap<ScrollIntoViewParams>;

// This should be something like
// TypedMap<{[K in keyof IBuildSpecs]?: ExecuteCodeOutputAsync}>
export type ProcessInfos = Map<string, TypedMap<ExecOutput>>;
