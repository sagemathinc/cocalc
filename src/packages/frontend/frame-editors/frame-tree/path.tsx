/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { React } from "../../app-framework";
import { filename_extension } from "@cocalc/util/misc";
import { file_associations } from "../../file-associations";
import { Icon } from "../../components";

interface Props {
  is_current?: boolean;
  project_id: string;
  path: string;
}

export const Path: React.FC<Props> = React.memo(
  ({ is_current, path, project_id: _project_id }) => {
    const ext = filename_extension(path);
    const x = file_associations[ext];
    return (
      <div
        className={
          is_current
            ? "cc-frame-tree-path cc-frame-tree-path-current"
            : "cc-frame-tree-path"
        }
      >
        {x?.icon && <Icon name={x.icon} />} {path}
      </div>
    );
  },
);
