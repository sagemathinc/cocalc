/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ProjectInfo } from "@cocalc/frontend/project/info";

export function ProjectInfoFlyout({ project_id, wrap }) {
  return <ProjectInfo project_id={project_id} wrap={wrap} mode="flyout" />;
}
