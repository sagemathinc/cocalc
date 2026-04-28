/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { tab_to_path } from "@cocalc/util/misc";
import { ShareIndicator } from "../share-indicator";

interface ShareIndicatorTabProps {
  activeTab?: string;
  project_id: string;
  compact?: boolean;
}

export function ShareIndicatorTab({
  activeTab,
  project_id,
}: ShareIndicatorTabProps) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const currentPath = useTypedRedux({ project_id }, "current_path");

  if (isAnonymous) return null;
  if (activeTab == null) return null;

  const path = activeTab === "files" ? currentPath : tab_to_path(activeTab);
  if (path == null || path === "") return null;

  return <ShareIndicator project_id={project_id} path={path} />;
}
