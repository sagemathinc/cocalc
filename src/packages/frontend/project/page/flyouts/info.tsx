/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ProjectInfo } from "@cocalc/frontend/project/info";

export function ProjectInfoFlyout({ project_id, wrap }) {
  return <ProjectInfo project_id={project_id} wrap={wrap} mode="flyout" />;
}
