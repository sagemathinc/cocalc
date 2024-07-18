/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Indicator about whether or not file or path is publicly shared.
*/

import { Button } from "antd";
import { containing_public_path } from "@cocalc/util/misc";
import {
  React,
  redux,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { HiddenXSSM } from "@cocalc/frontend/components";

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
}

export const ShareIndicator: React.FC<Props> = React.memo(
  ({ project_id, path }) => {
    const public_paths = useTypedRedux({ project_id }, "public_paths");
    const share_server = useTypedRedux("customize", "share_server");

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

    // don't share anything if share server disabled *or* if file
    // isn't already published.  When not published, you can publish it
    // via the File menu.
    if (!share_server || !is_public) {
      return <></>;
    }

    if (student_project_functionality.disableActions) {
      return <></>;
    }

    if (public_paths == null) {
      return <Loading />;
    }

    return (
      <div style={SHARE_INDICATOR_STYLE}>
        <Button
          style={{ color: "#333" }}
          onClick={() => {
            redux.getProjectActions(project_id).show_file_action_panel({
              path,
              action: "share",
            });
          }}
        >
          <Icon name={is_public ? "share-square" : "lock"} />
          <HiddenXSSM style={{ fontSize: "10.5pt", marginLeft: "5px" }}>
            {is_public ? "Published" : "Private"}
          </HiddenXSSM>
        </Button>
      </div>
    );
  },
);
