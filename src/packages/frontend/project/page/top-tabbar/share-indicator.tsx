/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { tab_to_path } from "@cocalc/util/misc";
import { ShareIndicator } from "../share-indicator";

interface ShareIndicatorTabProps {
  activeTab?: string;
  project_id: string;
  compact: boolean;
}

export function ShareIndicatorTab({
  activeTab,
  project_id,
  compact,
}: ShareIndicatorTabProps) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const currentPath = useTypedRedux({ project_id }, "current_path");

  if (isAnonymous) {
    // anon users can't share anything
    return null;
  }

  // no active tab, so nothing to share
  if (activeTab == null) return null;

  const path = activeTab === "files" ? currentPath : tab_to_path(activeTab);

  if (path == null) {
    // nothing specifically to share
    return null;
  }

  if (path === "") {
    // sharing whole project not implemented
    return null;
  }

  return (
    <ShareIndicator
      project_id={project_id}
      path={path}
      compact={compact}
      style={{ top: 0, right: 0, marginTop: 0 }}
    />
  );
}
