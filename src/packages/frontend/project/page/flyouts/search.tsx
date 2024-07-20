/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ProjectSearchBody } from "@cocalc/frontend/project/search/body";

export function SearchFlyout({ project_id, wrap }) {
  return (
    <ProjectSearchBody mode="flyout" project_id={project_id} wrap={wrap} />
  );
}
