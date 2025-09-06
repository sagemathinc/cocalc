/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* If the user is anonymous and they are using a project with more than one collaborator,
   strongly encourage them to set a better name... and also sign up.
*/

import { useState } from "react";
import { Alert, Input } from "antd";
import {
  React,
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "../app-framework";
import { Icon, Gap } from "../components";
import { SiteName } from "../customize";
import { lite } from "@cocalc/frontend/lite";

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
  const [editingName, setEditingName] = useState<boolean>(false);
  const actions = useActions("account");
  if (first_name == null || last_name == null || lite) {
    // loading?
    return <></>;
  }

  const icon = (
    <>
      <Icon
        name="exclamation-triangle"
        style={{ float: "right", margin: "7px 0 0 7px", fontSize: "16px" }}
      />
    </>
  );
  let mesg;
  if ((project?.get("users")?.size ?? 1) <= 1) {
    // no need to encourage a name -- they are alone; also, emphasize
    // that they could lose their work:
    mesg = (
      <div>
        {icon}
        Thank you for trying <SiteName />! Please{" "}
        <a onClick={() => redux.getActions("page").set_active_tab("account")}>
          sign up
        </a>{" "}
        to avoid losing access to your work.
      </div>
    );
  } else {
    const anonName =
      editingName ||
      first_name.startsWith("Anonymous") ||
      last_name.startsWith("User") ||
      !first_name.trim() ||
      !last_name.trim();
    mesg = (
      <div>
        {icon}
        <a
          style={{ float: "right", margin: "5px" }}
          onClick={() => redux.getActions("page").set_active_tab("account")}
        >
          Sign Up
        </a>
        Thank you {anonName ? "" : ` ${first_name} ${last_name} `} for using{" "}
        <SiteName />!<Gap />
        {anonName && (
          <>
            Set your name:{" "}
            <Input
              style={{ width: "20ex" }}
              value={first_name}
              onChange={
                (e) =>
                  actions.setState({
                    first_name: e.target.value,
                  }) /* sets in redux */
              }
              onFocus={() => setEditingName(true)}
              onBlur={() => {
                actions.set_account_table({
                  first_name,
                }); /* sets in database */
                setEditingName(false);
              }}
            />{" "}
            <Input
              style={{ width: "20ex" }}
              value={last_name}
              onChange={(e) => actions.setState({ last_name: e.target.value })}
              onFocus={() => setEditingName(true)}
              onBlur={() => {
                actions.set_account_table({ last_name });
                setEditingName(false);
              }}
            />{" "}
          </>
        )}
      </div>
    );
  }
  return (
    <Alert
      style={{ marginBottom: "5px" }}
      type="warning"
      message={mesg}
    ></Alert>
  );
});
