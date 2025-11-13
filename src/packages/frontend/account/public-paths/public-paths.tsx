/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Checkbox, Space, Spin, Table } from "antd";
import { join } from "path";
import { FormattedMessage, useIntl } from "react-intl";

import {
  React,
  redux,
  useActions,
  useEffect,
  useIsMountedRef,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon, Loading, TimeAgo } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { custom_image_name } from "@cocalc/frontend/custom-software/util";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { labels } from "@cocalc/frontend/i18n";
import { ComputeImageSelector } from "@cocalc/frontend/project/settings/compute-image-selector";
import { LICENSES } from "@cocalc/frontend/share/licenses";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { PublicPath as PublicPath0 } from "@cocalc/util/db-schema/public-paths";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { trunc, trunc_middle } from "@cocalc/util/misc";
import { UnpublishEverything } from "./unpublish-everything";

interface PublicPath extends PublicPath0 {
  status?: string;
}

type filters = "Listed" | "Unlisted" | "Unpublished" | "Authenticated";
const DEFAULT_CHECKED: filters[] = ["Listed", "Unlisted", "Authenticated"];

export const PublicPaths: React.FC = () => {
  const intl = useIntl();
  const account_id = useTypedRedux("account", "account_id");
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const showAuthenticatedOption = customize_kucalc !== KUCALC_COCALC_COM;
  const [data, set_data] = useState<PublicPath[] | undefined>(undefined);
  const [error, setError] = useState<string>("");
  const [loading, set_loading] = useState<boolean>(false);

  const [show_listed, set_show_listed] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Listed") != -1,
  );
  const [show_authenticated, set_show_authenticated] = useState<boolean>(
    showAuthenticatedOption && DEFAULT_CHECKED.indexOf("Authenticated") != -1,
  );
  const [show_unlisted, set_show_unlisted] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Unlisted") != -1,
  );
  const [show_unpublished, set_show_unpublished] = useState<boolean>(
    DEFAULT_CHECKED.indexOf("Unpublished") != -1,
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
    {
      title: "Image",
      dataIndex: "compute_image",
      key: "image",
      render: (_, record) => {
        return <ComputeImage {...record} setError={setError} />;
      },
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
      setError("");
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      set_loading(false);
      setError(err.toString());
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
        style={{ margin: "30px auto" }}
        type="info"
        banner
        message={
          <FormattedMessage
            id="account.public-paths.banner"
            defaultMessage={`This is an overview of your published files.
            <A>Visit this page for more details...</A>`}
            values={{
              A: (c) => (
                <A href={join(appBasePath, "share", "accounts", account_id)}>
                  {c}
                </A>
              ),
            }}
          />
        }
      />
      <Button onClick={fetch} disabled={loading} style={{ float: "right" }}>
        <Space>
          <Icon name="redo" />
          {intl.formatMessage(loading ? labels.loading : labels.refresh)}
        </Space>
      </Button>
      <h2>
        {intl.formatMessage(labels.published_files)} ({paths?.length ?? "?"})
      </h2>
      <FormattedMessage
        id="account.public-paths.info"
        defaultMessage={
          "Files that have been published in any project that you have actively used."
        }
      />
      <br />
      <br />
      {loading && <Loading />}
      {render_checkboxes()}
      <br />
      <ShowError error={error} setError={setError} />
      <br />
      {data != null && (
        <Table rowKey="id" columns={COLUMNS} dataSource={paths} />
      )}
      <UnpublishEverything data={data} refresh={fetch} />
    </div>
  );
};

function ComputeImage({ compute_image, project_id, path, setError }) {
  const [selectedImage, setSelectedImage] = useState<string>(compute_image);
  const [saving, setSaving] = useState<boolean>(false);
  const kucalc = useTypedRedux("customize", "kucalc");
  const onCoCalcCom = kucalc === KUCALC_COCALC_COM;

  useEffect(() => {
    setSelectedImage(compute_image);
  }, [compute_image]);

  return (
    <>
      <ComputeImageSelector
        disabled={saving}
        current_image={selectedImage}
        layout={"compact"}
        hideCustomImages={!onCoCalcCom}
        onSelect={async ({ id, type }) => {
          const img = type === "custom" ? custom_image_name(id) : id;
          setSelectedImage(img);
          try {
            setSaving(true);
            await webapp_client.async_query({
              query: { public_paths: { project_id, path, compute_image: img } },
            });
          } catch (err) {
            setError(`${err}`);
            // failed to save -- change back so clear indication
            // it didn't work, and also so they can try again.
            setSelectedImage(compute_image);
          } finally {
            setSaving(false);
          }
        }}
      />
      {saving && (
        <div>
          <Spin />
        </div>
      )}
    </>
  );
}
