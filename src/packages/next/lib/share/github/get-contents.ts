/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PathContents } from "lib/share/get-contents";

/*
export interface PathContents {
  isdir?: boolean;
  listing?: FileInfo[];
  content?: string;
  size?: number;
  mtime?: number;
  truncated?: string;
}

*/

export default async function getContents(
  id: string,
  githubOrg: string,
  githubProject: string,
  segments: string[]
): Promise<PathContents> {
  return {
    content: `Hello **GitHub**! - \n\`\`\`js\n${JSON.stringify({
      id,
      githubOrg,
      githubProject,
      segments,
    },undefined,2)}\n\`\`\``,
  };
}
