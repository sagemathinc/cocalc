/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux, useActions } from "../app-framework";
import { user_activity } from "../tracker";
import { Button, ButtonGroup } from "../antd-bootstrap";
import { Icon } from "../r_misc";

export const ProjectsFilterButtons: React.FC = () => {
  const deleted = useTypedRedux("projects", "deleted");
  const hidden = useTypedRedux("projects", "hidden");
  const actions = useActions("projects");

  function render_deleted_button(): JSX.Element {
    const style = deleted ? "warning" : undefined;
    return (
      <Button
        onClick={() => {
          actions.display_deleted_projects(!deleted);
          user_activity("projects_page", "clicked_deleted_filter");
        }}
        bsStyle={style}
        cocalc-test={"deleted-filter"}
      >
        <Icon name={deleted ? "check-square-o" : "square-o"} fixedWidth />{" "}
        Deleted
      </Button>
    );
  }

  function render_hidden_button(): JSX.Element {
    const style = hidden ? "warning" : undefined;
    return (
      <Button
        onClick={() => {
          actions.display_hidden_projects(!hidden);
          user_activity("projects_page", "clicked_hidden_filter");
        }}
        bsStyle={style}
        cocalc-test={"hidden-filter"}
      >
        <Icon name={hidden ? "check-square-o" : "square-o"} fixedWidth /> Hidden
      </Button>
    );
  }

  return (
    <ButtonGroup>
      {render_deleted_button()}
      {render_hidden_button()}
    </ButtonGroup>
  );
};
