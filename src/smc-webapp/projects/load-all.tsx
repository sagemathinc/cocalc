/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  useActions,
  useTypedRedux,
  useState,
  useIsMountedRef,
} from "../app-framework";
import { Loading } from "../r_misc";
import { Button } from "../antd-bootstrap";

export const LoadAllProjects: React.FC = React.memo(() => {
  const done = useTypedRedux("projects", "all_projects_have_been_loaded");
  const [loading, set_loading] = useState<boolean>(false);
  const is_mounted_ref = useIsMountedRef();
  const actions = useActions("projects");

  async function load() {
    set_loading(true);
    await actions.load_all_projects();
    if (!is_mounted_ref.current) {
      return;
    }
    set_loading(false);
  }

  if (done) {
    return <></>;
  } else {
    return (
      <div
        style={{
          width: "100%",
          fontSize: "18px",
          textAlign: "center",
          padding: "15px",
        }}
      >
        <Button disabled={loading} onClick={load} bsSize="large">
          {loading ? <Loading /> : "Load any older projects..."}
        </Button>
      </div>
    );
  }
});
