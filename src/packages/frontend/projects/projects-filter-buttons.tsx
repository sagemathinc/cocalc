/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux, useActions } from "../app-framework";
import { user_activity } from "../tracker";
import { Button, ButtonGroup } from "../antd-bootstrap";
import { Icon } from "../components";

export const ProjectsFilterButtons: React.FC = () => {
  const deleted = useTypedRedux("projects", "deleted");
  const hidden = useTypedRedux("projects", "hidden");
  const starred = useTypedRedux("projects", "starred");
  const actions = useActions("projects");

  function render_deleted_button(): React.JSX.Element {
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
        <Icon
          name={deleted ? "check-square-o" : "square-o"}
          style={{ width: "1.125em" }}
        />{" "}
        Deleted
      </Button>
    );
  }

  function render_hidden_button(): React.JSX.Element {
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
        <Icon
          name={hidden ? "check-square-o" : "square-o"}
          style={{ width: "1.125em" }}
        />{" "}
        Hidden
      </Button>
    );
  }

  function render_starred_button(): React.JSX.Element {
    const style = starred ? "warning" : undefined;
    return (
      <Button
        onClick={() => {
          actions.display_starred_projects(!starred);
          user_activity("projects_page", "clicked_starred_filter");
        }}
        bsStyle={style}
        cocalc-test={"starred-filter"}
      >
        <Icon
          name={starred ? "star-filled" : "star"}
          style={{ width: "1.125em" }}
        />{" "}
        Starred
      </Button>
    );
  }

  return (
    <ButtonGroup>
      {render_starred_button()}
      {render_deleted_button()}
      {render_hidden_button()}
    </ButtonGroup>
  );
};
