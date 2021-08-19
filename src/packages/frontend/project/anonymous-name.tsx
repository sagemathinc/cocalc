/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* If the user is anonymous and they are using a project with more than one collaborator,
   strongly encourage them to set a better name... and also sign up.
*/

import { Alert } from "antd";
import {
  React,
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "../app-framework";
import { Icon, Space } from "../r_misc";
const { SiteName } = require("../customize");

interface Props {
  project_id: string;
}

// We break this component up to use less "useRedux" hooks, for efficiency reasons...

export const AnonymousName: React.FC<Props> = React.memo(({ project_id }) => {
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  if (!is_anonymous) {
    // no need to do thisencourage a name -- they are by themself.
    return <></>;
  }
  return <AnonymousNameInput project_id={project_id} />;
});

const AnonymousNameInput: React.FC<Props> = React.memo(({ project_id }) => {
  const project = useRedux(["project_map", project_id], "projects");
  const first_name = useTypedRedux("account", "first_name");
  const last_name = useTypedRedux("account", "last_name");
  const actions = useActions("account");
  if (first_name == null || last_name == null) {
    // loading?
    return <></>;
  }

  const icons = (
    <>
      <Icon
        name="exclamation-triangle"
        style={{ float: "right", marginTop: "3px" }}
      />
      <Icon name="exclamation-triangle" />{" "}
    </>
  );
  let mesg;
  if ((project?.get("users")?.size ?? 1) <= 1) {
    // no need to encourage a name -- they are alone.
    mesg = (
      <div>
        {icons}
        Thank you for trying <SiteName />! <Space />
        <Space />
        <Space />
        Please{" "}
        <a onClick={() => redux.getActions("page").set_active_tab("account")}>
          sign up
        </a>{" "}
        to avoid losing your work.
      </div>
    );
  } else {
    mesg = (
      <div>
        {icons}
        Thank you for trying <SiteName />! <Space />
        <Space />
        <Space />
        Set a name so people know who you are:{" "}
        <input
          value={first_name}
          onChange={
            (e) =>
              actions.setState({
                first_name: e.target.value,
              }) /* sets in redux */
          }
          onBlur={
            () =>
              actions.set_account_table({ first_name }) /* sets in database */
          }
        />{" "}
        <input
          value={last_name}
          onChange={(e) => actions.setState({ last_name: e.target.value })}
          onBlur={() => actions.set_account_table({ last_name })}
        />{" "}
        <Space />
        <Space />
        Better yet,{" "}
        <a onClick={() => redux.getActions("page").set_active_tab("account")}>
          sign up
        </a>{" "}
        to avoid losing your work.
      </div>
    );
  }
  return <Alert type="warning" message={mesg}></Alert>;
});
