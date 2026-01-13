/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Link from "next/link";
import { WORKSPACE_LABEL } from "@cocalc/util/i18n/terminology";

interface Props {
  project_id: string;
  title?: string;
}

export default function ProjectLink({ project_id, title }: Props) {
  return (
    <Link href={`/share/projects/${project_id}`}>
      {title?.trim() ? title : `A ${WORKSPACE_LABEL}`}
    </Link>
  );
}
