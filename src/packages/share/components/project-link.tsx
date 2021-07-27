/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";

interface Props {
  project_id: string;
  title?: string;
}

export default function ProjectLink({ project_id, title }: Props) {
  return (
    <Link href={`/projects/${project_id}`}>
      <a>{title?.trim() ? title : "A Project"}</a>
    </Link>
  );
}
