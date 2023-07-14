/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Indicator about whether or not file or path is publicly shared.
*/

import { Button, Tooltip } from "antd";

import {
  CSS,
  React,
  redux,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { HiddenXSSM, Icon, Loading } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { containing_public_path } from "@cocalc/util/misc";

const SHARE_INDICATOR_STYLE = {
  fontSize: "14pt",
  borderRadius: "3px",
  marginTop: "3px",
  display: "flex",
  top: "-30px",
  right: "3px",
} as const;

interface Props {
  project_id: string;
  path: string;
  compact?: boolean; // if set, label is controlled externally
  style?: CSS;
}

export const ShareIndicator: React.FC<Props> = React.memo(
  ({ project_id, path, compact, style }) => {
    const public_paths = useTypedRedux({ project_id }, "public_paths");

    const student_project_functionality =
      useStudentProjectFunctionality(project_id);

    const is_public = useMemo(() => {
      if (public_paths == null) return false;
      const paths: string[] = [];
      public_paths.forEach(function (info) {
        if (!info.get("disabled")) {
          paths.push(info.get("path"));
        }
      });
      return containing_public_path(path, paths) != null;
    }, [public_paths, path, project_id]);

    if (student_project_functionality.disableActions) {
      return <></>;
    }

    if (public_paths == null) {
      return <Loading />;
    }

    function tooltipTitle() {
      if (is_public) {
        return "This file is publicly shared.";
      } else {
        return "This file is only visible to project collaborators.";
      }
    }

    function renderLabel() {
      const style: CSS = { fontSize: "10.5pt", marginLeft: "5px" };
      const label = is_public ? "Published" : "Publish";
      if (typeof compact === "boolean") {
        return compact ? null : <span style={style}>{label}</span>;
      }
      return <HiddenXSSM style={style}>{label}</HiddenXSSM>;
    }

    return (
      <div style={{ ...SHARE_INDICATOR_STYLE, ...style }}>
        <Tooltip title={tooltipTitle()} placement="bottom">
          <Button
            onClick={() => {
              redux.getProjectActions(project_id).show_file_action_panel({
                path,
                action: "share",
              });
            }}
          >
            <Icon name={is_public ? "bullhorn" : "lock"} />
            {renderLabel()}
          </Button>
        </Tooltip>
      </div>
    );
  }
);
