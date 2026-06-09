/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Indicator about whether or not file or path is publicly shared.
*/

import { Button } from "antd";
import {
  React,
  redux,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { HiddenXSSM } from "@cocalc/frontend/components";
import { containing_public_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

const SHARE_INDICATOR_STYLE = {
  display: "flex",
  alignItems: "stretch",
  height: "100%",
  paddingLeft: "5px",
  paddingRight: "6px",
  background: `var(--cocalc-top-bar-bg, ${COLORS.GRAY_L0})`,
  borderTop: `2px solid var(--cocalc-border-light, ${COLORS.GRAY_L})`,
} as const;

interface Props {
  project_id: string;
  path: string;
}

export const ShareIndicator: React.FC<Props> = React.memo(
  ({ project_id, path }) => {
    const [hovered, setHovered] = React.useState(false);
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
          size="small"
          type="text"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "100%",
            paddingInline: "10px",
            borderRadius: 0,
            color: `var(--cocalc-top-bar-text, ${COLORS.GRAY})`,
            background: hovered
              ? `var(--cocalc-top-bar-hover, ${COLORS.GRAY_LLL})`
              : "transparent",
            boxShadow: "none",
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => {
            redux.getProjectActions(project_id).show_file_action_panel({
              path,
              action: "share",
            });
          }}
        >
          <Icon name={is_public ? "share-square" : "lock"} />
          <HiddenXSSM style={{ fontSize: "10.5pt", marginLeft: "4px" }}>
            {is_public ? "Published" : "Private"}
          </HiddenXSSM>
        </Button>
      </div>
    );
  },
);
