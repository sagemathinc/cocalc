/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Utility function for determining the labels to put on file tabs.
*/

import { path_split } from "smc-util/misc";

export function file_tab_labels(paths: string[]): string[] {
  const labels: string[] = [];
  const counts: { [filename: string]: number } = {};
  for (const path of paths) {
    const { tail } = path_split(path);
    counts[tail] = counts[tail] === undefined ? 1 : counts[tail] + 1;
    labels.push(tail);
  }
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (counts[label] > 1) {
      labels[i] = paths[i];
    }
  }
  return labels;
}
