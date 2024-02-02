/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Flex, Switch } from "antd";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { user_activity } from "@cocalc/frontend/tracker";

export const ProjectsFilterButtons: React.FC = () => {
  const deleted = useTypedRedux("projects", "deleted");
  const hidden = useTypedRedux("projects", "hidden");
  const actions = useActions("projects");

  function render_deleted_button(): JSX.Element {
    return (
      <>
        <Switch
          checked={deleted}
          onChange={() => {
            actions.display_deleted_projects(!deleted);
            user_activity("projects_page", "clicked_deleted_filter");
          }}
        />{" "}
        Deleted
      </>
    );
  }

  function render_hidden_button(): JSX.Element {
    return (
      <>
        <Switch
          checked={hidden}
          onChange={() => {
            actions.display_hidden_projects(!hidden);
            user_activity("projects_page", "clicked_hidden_filter");
          }}
        />{" "}
        Hidden
      </>
    );
  }

  return (
    <Flex vertical={false} gap={10}>
      {render_deleted_button()}
      {render_hidden_button()}
    </Flex>
  );
};
