/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useActions,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";

export const LoadAllProjects: React.FC = React.memo(() => {
  const intl = useIntl();
  const done = useTypedRedux("projects", "all_projects_have_been_loaded");
  const [loading, set_loading] = useState<boolean>(false);
  const is_mounted_ref = useIsMountedRef();
  const actions = useActions("projects");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  if (is_anonymous) return <></>;

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
          {loading ? (
            <Loading />
          ) : (
            intl.formatMessage({
              id: "projects.load-all.label",
              defaultMessage: "Show all projects...",
            })
          )}
        </Button>
      </div>
    );
  }
});
