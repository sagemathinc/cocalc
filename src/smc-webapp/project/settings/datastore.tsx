/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Datastore (kucalc only!)
*/

import { React, useState, useIsMountedRef } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
// import { useProjectState } from "../page/project-state-hook";
import {
  ReloadOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { Button, Table, Typography, Form, Input, Checkbox } from "antd";
import { Space as AntdSpace } from "antd";
import { ErrorDisplay, SettingBox, Space } from "../../r_misc";
// import * as jsonic from "jsonic";

interface ConfigCommon {
  key: string; // "key" for Antd table
  about?: string;
  readonly?: boolean;
}

interface ConfigGCS extends ConfigCommon {
  type: "gcs";
  bucket: string;
}

interface ConfigS3 extends ConfigCommon {
  type: "s3";
  keyid: string;
  bucket: string;
}

type Config = ConfigS3 | ConfigGCS;

function raw2configs(raw: { [key: string]: Config }): Config[] {
  const ret: Config[] = [];
  for (const [k, v] of Object.entries(raw)) {
    v.key = k;
    if (v.type === "s3") {
      v.about = `Key ID: ${v.keyid}\nBucket: ${v.bucket}`;
    } else {
      v.about = `Bucket: ${v.bucket}`;
    }
    ret.push(v);
  }
  return ret;
}

const READONLY_DEFAULT = false;

interface Props {
  project_id: string;
}

export const Datastore: React.FC<Props> = (props: Props) => {
  const { project_id } = props;
  // const state = useProjectState(project_id);
  // const is_running = state.get("state") === "running";
  // const env = useRedux(["projects", "project_map", project_id, "env"]);
  const [edited, set_edited] = useState<boolean>(false);
  const [loading, set_loading] = useState<boolean>(false);
  const [error, set_error] = useState<string>("");
  const [new_config, set_new_config] = useState<Config | null>(null);
  const editing = new_config != null;
  // const actions = useActions({ project_id });
  const is_mounted_ref = useIsMountedRef();
  // const [saving, set_saving] = useState<boolean>(false);
  // const disabled = useMemo(() => {
  //   return to_json(env?.toJS()) == editing;
  // }, [env, editing]);
  const [configs, set_configs] = useState<Config[]>([]);
  const [form_readonly, set_form_readonly] = useState<boolean>(
    READONLY_DEFAULT
  );
  const [form_gcs] = Form.useForm();
  const [form_s3] = Form.useForm();

  async function add(type: Config["type"]): Promise<void> {
    if (type == "s3") {
      set_new_config({ type: "s3", key: "", keyid: "", bucket: "" });
    } else if (type == "gcs") {
      set_new_config({ type: "gcs", key: "", bucket: "" });
    }
    set_edited(true);
    set_form_readonly(READONLY_DEFAULT);
  }

  function render_instructions() {
    if (!edited) return null;

    return (
      <>
        <Space />
        <Typography.Text type="secondary">
          Restart your project for these changes to take effect.
        </Typography.Text>
      </>
    );
  }

  async function get() {
    const query = {
      project_datastore: {
        project_id,
        addons: { datastore: null },
      },
    };
    return (await webapp_client.query({ query })).query.project_datastore;
  }

  async function reload() {
    try {
      set_loading(true);
      const raw = await get();
      if (!is_mounted_ref.current) return;
      if (raw.type === "error") {
        // we encountered an error
        set_error(raw.error);
      }
      if (raw.addons?.datastore == null) {
        set_configs([]);
      } else {
        set_configs(raw2configs(raw.addons.datastore));
      }
    } catch (err) {
      if (err) set_error(err);
    } finally {
      set_loading(false);
    }
  }

  // reload once after mounting
  React.useEffect(() => {
    reload();
  }, []);

  function render_list() {
    return (
      <Table<Config> dataSource={configs} loading={loading} pagination={false}>
        <Table.Column<Config> key="type" title="Type" dataIndex="type" />
        <Table.Column<Config> key="key" title="Name" dataIndex="key" />
        <Table.Column<Config>
          key="about"
          title="About"
          dataIndex="about"
          render={(about) => (
            <div style={{ whiteSpace: "pre", fontSize: "80%" }}>{about}</div>
          )}
        />
        <Table.Column<Config>
          key="remove"
          title="Remove"
          dataIndex="remove"
          render={(_, record) => (
            <Button
              onClick={() => window.alert(`remove ${record.key}`)}
              icon={<DeleteOutlined />}
            ></Button>
          )}
        />
      </Table>
    );
  }

  function render_controls() {
    return (
      <AntdSpace style={{ marginBottom: "10px" }}>
        <Button
          icon={<PlusCircleOutlined />}
          onClick={() => add("gcs")}
          type={"primary"}
          disabled={editing}
        >
          GCS
        </Button>

        <Button
          icon={<PlusCircleOutlined />}
          onClick={() => add("s3")}
          type={"primary"}
          disabled={editing}
        >
          AWS S3
        </Button>

        <Button icon={<ReloadOutlined />} onClick={reload}>
          Reload
        </Button>
      </AntdSpace>
    );
  }

  const form_layout = { labelCol: { span: 4 }, wrapperCol: { span: 14 } };
  const form_layout_tail = {
    wrapperCol: { offset: 4, span: 14 },
  };

  function render_form_bottom() {
    return (
      <>
        <Form.Item label="Read-only" name="readonly">
          <Checkbox
            checked={form_readonly}
            onChange={(e) => set_form_readonly(e.target.checked)}
          />
        </Form.Item>
        <Form.Item {...form_layout_tail}>
          <AntdSpace>
            <Button type="primary" htmlType="submit">
              Save
            </Button>
            <Button onClick={() => set_new_config(null)}>Cancel</Button>
          </AntdSpace>
        </Form.Item>
      </>
    );
  }

  function render_form_name() {
    return (
      <Form.Item
        label="Name"
        name="name"
        required
        tooltip="Name for mounting it, must be lowercase alphanumeric."
      >
        <Input placeholder="" />
      </Form.Item>
    );
  }

  function render_new_gcs() {
    const creds_help =
      "JSON formatted content of the service account credentials...";
    return (
      <Form
        {...form_layout}
        form={form_gcs}
        onFinish={(values: any) => {
          values.readonly = form_readonly;
          window.alert(`save ${JSON.stringify(values)}`);
        }}
      >
        {render_form_name()}
        <Form.Item label="Bucket" name="bucket" required tooltip="The bucket">
          <Input placeholder="" />
        </Form.Item>
        <Form.Item
          label="Credentials"
          name="secret"
          required
          tooltip={creds_help}
        >
          <Input.TextArea rows={5} placeholder={creds_help} />
        </Form.Item>
        {render_form_bottom()}
      </Form>
    );
  }

  function render_new_s3() {
    return (
      <Form
        {...form_layout}
        form={form_s3}
        onFinish={(values: any) => {
          values.readonly = form_readonly;
          window.alert(`save ${JSON.stringify(values)}`);
        }}
      >
        {render_form_name()}
        <Form.Item label="Bucket" name="bucket" required tooltip="The bucket">
          <Input placeholder="" />
        </Form.Item>
        <Form.Item label="Key ID" name="keyid" required tooltip="The Key ID">
          <Input placeholder="" />
        </Form.Item>
        <Form.Item
          label="Secret"
          name="secret"
          required
          tooltip="The secret key"
        >
          <Input placeholder="" />
        </Form.Item>
        {render_form_bottom()}
      </Form>
    );
  }

  function render_new_config() {
    if (new_config == null) return;
    return (
      <>
        {new_config.type === "s3" && render_new_s3()}
        {new_config.type === "gcs" && render_new_gcs()}
      </>
    );
  }

  function render_body() {
    return (
      <>
        {false && <pre>{JSON.stringify(configs, null, 2)}</pre>}
        {false && <Space />}
        {render_controls()}
        {render_new_config()}
        {render_instructions()}
        <Space />
        {render_list()}
      </>
    );
  }

  return (
    <SettingBox
      title={
        <span>
          Datastore
          <sup>
            <i>beta</i>
          </sup>
        </span>
      }
      icon="bars"
    >
      {error != "" ? <ErrorDisplay error={error} /> : undefined}
      {render_body()}
    </SettingBox>
  );
};
