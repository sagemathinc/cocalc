/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Node } from "slate";


export function slate_to_markdown(data: Node[]): string {
  return (data[0]?.children as any)[0]?.text ?? "";
}

