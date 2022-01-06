/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Checkbox, Table } from "antd";
import {
  redux,
  React,
  useActions,
  useState,
  useEffect,
  useIsMountedRef,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { PublicPath as PublicPath0 } from "@cocalc/util/db-schema/public-paths";
import { trunc, trunc_middle } from "@cocalc/util/misc";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  ErrorDisplay,
  Icon,
  Loading,
  Space,
  TimeAgo,
  A,
} from "@cocalc/frontend/components";
import { UnpublishEverything } from "./unpublish-everything";
import { LICENSES } from "@cocalc/frontend/share/licenses";
import { Footer } from "@cocalc/frontend/customize";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { Alert } from "antd";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

interface PublicPath extends PublicPath0 {
  status?: string;
}

type filters = "Listed" | "Unlisted" | "Unpublished" | "Authenticated";
const DEFAULT_CHECKED: filters[] = ["Listed", "Unlisted", "Authenticated"];

export const PublicPaths: React.FC = () => {
  const account_id = useTypedRedux("account", "account_id");
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const showAuthenticatedOption = customize_kucalc !== KUCALC_COCALC_COM;
  const [data, set_data] = useState<PublicPath[] | undefined>(undefined);
  const [error, set_error] = useState<string>("");
  const [loading, set_loading] = useState<boolean>(false);

  const [show_listed, set_show_listed] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Listed") != -1
  );
  const [show_authenticated, set_show_authenticated] = useState<boolean>(
    showAuthenticatedOption && DEFAULT_CHECKED.indexOf("Authenticated") != -1
  );
  const [show_unlisted, set_show_unlisted] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Unlisted") != -1
  );
  const [show_unpublished, set_show_unpublished] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Unpublished") != -1
  );

  const isMountedRef = useIsMountedRef();
  const project_map = useTypedRedux("projects", "project_map");
  const actions = useActions("projects");

  const paths: PublicPath[] = useMemo(() => {
    const v: PublicPath[] = [];
    if (data != null) {
      for (const path of data) {
        if (path.disabled) {
          if (show_unpublished) {
            path.status = "Unpublished";
            v.push(path);
          }
          continue;
        }
        if (path.unlisted) {
          if (show_unlisted) {
            path.status = "Unlisted";
            v.push(path);
          }
          continue;
        }
        if (path.authenticated) {
          if (show_authenticated) {
            path.status = "Authenticated";
            v.push(path);
          }
          continue;
        }
        if (show_listed) {
          path.status = "Listed";
          v.push(path);
        }
      }
    }
    return v;
  }, [data, show_listed, show_unlisted, show_unpublished, show_authenticated]);

  const COLUMNS = [
    {
      title: "Path",
      dataIndex: "path",
      key: "path",
      render: (path, record) => {
        return (
          <a
            onClick={async () => {
              await actions?.open_project({ project_id: record.project_id });
              redux
                .getProjectActions(record.project_id)
                ?.show_public_config(path);
            }}
          >
            {trunc_middle(path, 64)}
          </a>
        );
      },
    },
    {
      title: "Project",
      dataIndex: "project_id",
      key: "project_id",
      render: (project_id) => {
        const project = project_map?.get(project_id);
        if (project == null) {
          actions?.load_all_projects();
          return <Loading />;
        }
        const title = project.get("title") ?? "No Title";
        return (
          <a onClick={() => actions?.open_project({ project_id })}>
            {trunc_middle(title, 64)}
          </a>
        );
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      render: (description) => <span>{trunc(description, 32)}</span>,
    },
    {
      title: "Last edited",
      dataIndex: "last_edited",
      key: "last_edited",
      render: (date) => <TimeAgo date={date} />,
    },
    {
      title: "License",
      dataIndex: "license",
      key: "license",
      render: (license) => trunc_middle(LICENSES[license] ?? "None", 32),
    },
    {
      title: "Counter",
      dataIndex: "counter",
      key: "counter",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
    },
  ];

  async function fetch() {
    set_loading(true);
    try {
      const data = (
        await webapp_client.async_query({
          query: {
            all_public_paths: {
              id: null,
              project_id: null,
              path: null,
              description: null,
              disabled: null,
              unlisted: null,
              authenticated: null,
              license: null,
              last_edited: null,
              created: null,
              last_saved: null,
              counter: null,
              compute_image: null,
            },
          },
        })
      ).query.all_public_paths;
      if (!isMountedRef.current) {
        return;
      }
      set_loading(false);
      set_data(data);
      set_error("");
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      set_loading(false);
      set_error(err.toString());
    }
  }

  useEffect(() => {
    fetch();
  }, []);

  function render_checkboxes() {
    if (loading) return;
    const options = ["Listed", "Unlisted", "Unpublished"];
    if (showAuthenticatedOption) {
      options.splice(2, 0, "Authenticated");
    }
    return (
      <Checkbox.Group
        options={options}
        defaultValue={DEFAULT_CHECKED}
        onChange={(v) => {
          set_show_listed(v.indexOf("Listed") != -1);
          set_show_unlisted(v.indexOf("Unlisted") != -1);
          set_show_unpublished(v.indexOf("Unpublished") != -1);
          set_show_authenticated(v.indexOf("Authenticated") != -1);
        }}
      />
    );
  }

  return (
    <div style={{ marginBottom: "64px" }}>
      <Alert
        showIcon
        style={{ maxWidth: "600px", margin: "30px auto" }}
        type="warning"
        message={
          <>
            This is the old public files page (which still works).{" "}
            <A href={join(appBasePath, "share", "accounts", account_id)}>
              Try the new page...
            </A>
          </>
        }
      />
      <Button onClick={fetch} disabled={loading} style={{ float: "right" }}>
        <Icon name="redo" />
        <Space /> <Space /> {loading ? "Loading..." : "Refresh"}
      </Button>
      <h2>Public files ({paths?.length ?? "?"})</h2>
      Files that have been published in any project that you have actively used.
      <br />
      <br />
      {loading && <Loading />}
      {render_checkboxes()}
      <br />
      {error != "" && (
        <ErrorDisplay style={{ marginTop: "32px" }} error={error} />
      )}
      <br />
      {data != null && (
        <Table rowKey="id" columns={COLUMNS} dataSource={paths} />
      )}
      <UnpublishEverything data={data} refresh={fetch} />
      <br />
      <Footer />
    </div>
  );
};
