/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "antd";
import { NextRouter } from "next/router";
import { useLicenseProject } from "./util";

export const ApplyLicenseToProject: React.FC<{ router: NextRouter }> = ({
  router,
}) => {
  const { upgradeProjectId, upgradeProjectDelete } = useLicenseProject(router);

  function body(): JSX.Element {
    if (!upgradeProjectId) throw new Error("should never happen");
    return (
      <div>
        After purchasing this license, it will be applied to project{" "}
        <code>{upgradeProjectId}</code>
      </div>
    );
  }

  if (!upgradeProjectId) return null;

  return (
    <Alert
      type="info"
      message={body()}
      style={{ marginBottom: "20px" }}
      closable
      onClose={() => upgradeProjectDelete()}
    />
  );
};
