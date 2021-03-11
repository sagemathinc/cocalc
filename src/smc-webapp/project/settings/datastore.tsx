/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
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
import { Space as AntdSpace, Alert, Switch } from "antd";
import { ErrorDisplay, SettingBox, Space } from "../../r_misc";
import { unreachable } from "smc-util/misc";
// import * as jsonic from "jsonic";

interface ConfigCommon {
  key: string; // [a-z0-9-_]; "key" for Antd table, otherwise "name"
  about?: string; // populated with a string for the user to see
  readonly?: boolean;
  mountpoint?: string; // [a-z0-9-_]
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

interface ConfigSSHFS extends ConfigCommon {
  type: "sshfs";
  user: string;
  host: string;
  path?: string; // remote path, defaults to /home/user
}

type Config = ConfigS3 | ConfigGCS | ConfigSSHFS;

const rule_required = [
  { required: true, message: "This is a required field." },
];

const rule_alphanum = [
  rule_required[0],
  {
    pattern: /^[0-9a-z-_.]+$/,
    message:
      'Must be lowercase alphanumeric and no spaces, i.e. a-z, 0-9, "-", "." and "_" are allowed.',
  },
];

// convert the configuration from the DB to fields for the table
function raw2configs(raw: { [key: string]: Config }): Config[] {
  const ret: Config[] = [];
  for (const [k, v] of Object.entries(raw)) {
    v.key = k;
    switch (v.type) {
      case "s3":
        v.about = `Key ID: ${v.keyid}\nBucket: ${v.bucket}`;
        break;
      case "gcs":
        v.about = `Bucket: ${v.bucket}`;
        break;
      case "sshfs":
        v.about = [
          `User: ${v.user}`,
          `Host: ${v.host}`,
          `Path: ${v.path ?? ""}`,
        ].join("\n");
        break;
      default:
        unreachable(v);
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
  const [show_help, set_show_help] = useState<boolean>(false);
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
  const [form_sshfs] = Form.useForm();

  async function add(type: Config["type"]): Promise<void> {
    switch (type) {
      case "s3":
        set_new_config({ type: "s3", key: "", keyid: "", bucket: "" });
        break;
      case "gcs":
        set_new_config({ type: "gcs", key: "", bucket: "" });
        break;
      case "sshfs":
        set_new_config({
          type: "sshfs",
          key: "",
          user: "",
          host: "",
          path: "",
        });
        break;
      default:
        unreachable(type);
    }
    set_edited(true);
    set_form_readonly(READONLY_DEFAULT);
  }

  function render_instructions() {
    if (!edited) return null;

    return (
      <Alert
        type={"warning"}
        message={
          <Typography.Text type="warning">
            Restart your project for these changes to take effect.
          </Typography.Text>
        }
      />
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
          onClick={() => add("sshfs")}
          type={"primary"}
          disabled={editing}
        >
          SSHFS
        </Button>

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

        <Form.Item label="Help:" style={{ marginBottom: 0 }}>
          <Switch checked={show_help} onChange={(val) => set_show_help(val)} />
        </Form.Item>
      </AntdSpace>
    );
  }

  function render_help() {
    if (!show_help) return;
    return (
      <Alert
        type="info"
        message={
          <div>
            <h1>Help</h1>help help
          </div>
        }
      />
    );
  }

  const form_layout = { labelCol: { span: 6 }, wrapperCol: { span: 18 } };
  const form_layout_tail = {
    wrapperCol: { offset: 6, span: 18 },
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
        rules={rule_alphanum}
        tooltip={"Name of the datastore."}
      >
        <Input placeholder="" />
      </Form.Item>
    );
  }

  function ConfigForm(props) {
    // failed err looks like that:
    // {"values":{"name":""},
    //  "errorFields":[
    //    {"name":["name"],"errors":["Name, must be lowercase alphanumeric, [a-z0-9-_]."]},
    //    {"name":["bucket"],"errors":["Name of the S3 bucket"]}
    // ],"outOfDate":false}
    return (
      <Form
        {...form_layout}
        form={props.form}
        onFinish={(values: any) => {
          values.readonly = form_readonly;
          window.alert(`save ${props.type} ${JSON.stringify(values)}`);
        }}
        onFinishFailed={(err) =>
          window.alert(`Form problem: ${JSON.stringify(err)}`)
        }
      >
        {props.children}
      </Form>
    );
  }

  function render_new_gcs() {
    const creds_help =
      "JSON formatted content of the service account credentials...";
    const msg_bucket = "Name of the S3 bucket";
    return (
      <ConfigForm form={form_gcs} type={"gcs"}>
        {render_form_name()}
        <Form.Item
          label="Bucket"
          name="bucket"
          rules={rule_alphanum}
          tooltip={msg_bucket}
        >
          <Input placeholder="name-of-bucket-01" />
        </Form.Item>
        <Form.Item
          label="Credentials"
          name="secret"
          rules={rule_required}
          tooltip={creds_help}
        >
          <Input.TextArea rows={5} placeholder={creds_help} />
        </Form.Item>
        {render_form_bottom()}
      </ConfigForm>
    );
  }

  function render_new_s3() {
    return (
      <ConfigForm form={form_s3} type={"s3"}>
        {render_form_name()}
        <Form.Item
          label="Bucket"
          name="bucket"
          rules={rule_alphanum}
          tooltip="The bucket"
        >
          <Input placeholder="name-of-bucket-01" />
        </Form.Item>
        <Form.Item
          label="Key ID"
          name="keyid"
          rules={rule_required}
          tooltip="The Key ID"
        >
          <Input placeholder="AFiwFw892...." />
        </Form.Item>
        <Form.Item
          label="Secret"
          name="secret"
          rules={rule_required}
          tooltip="The secret key"
        >
          <Input placeholder="fie$kf2&ifw..." />
        </Form.Item>
        {render_form_bottom()}
      </ConfigForm>
    );
  }

  function render_new_sshfs() {
    const pk_help =
      "This must be a passphrase-less private key, which allows to connect to the remove OpenSSH server.";
    const pk_example =
      "-----BEGIN OPENSSH PRIVATE KEY-----\naNmQfie...\n...\n...\n-----END OPENSSH PRIVATE KEY-----";
    return (
      <ConfigForm form={form_sshfs} type={"sshfs"}>
        {render_form_name()}
        <Form.Item
          label="User"
          name="user"
          rules={rule_required}
          tooltip="The username in [user]@[host]"
        >
          <Input placeholder="foo..." />
        </Form.Item>
        <Form.Item
          label="Host"
          name="host"
          rules={rule_required}
          tooltip="The host in [user]@[host]"
        >
          <Input placeholder="login.server.edu" />
        </Form.Item>
        <Form.Item
          label="Path"
          name="path"
          tooltip="The remote path to mount, defaults to '/home/[user]'"
        >
          <Input placeholder="" />
        </Form.Item>
        <Form.Item label="Private Key" name="secret" required tooltip={pk_help}>
          <Input.TextArea rows={5} placeholder={pk_example} />
        </Form.Item>
        {render_form_bottom()}
      </ConfigForm>
    );
  }

  function render_new_config() {
    if (new_config == null) return;
    return (
      <>
        {new_config.type === "s3" && render_new_s3()}
        {new_config.type === "gcs" && render_new_gcs()}
        {new_config.type === "sshfs" && render_new_sshfs()}
      </>
    );
  }

  function render_body() {
    return (
      <>
        {false && <pre>{JSON.stringify(configs, null, 2)}</pre>}
        {false && <Space />}
        {render_controls()}
        {render_help()}
        {render_new_config()}
        {render_instructions()}
        <Space />
        {render_list()}
      </>
    );
  }

  function render_title() {
    return (
      <>
        <span>
          Datastore
          <sup>
            <i>beta</i>
          </sup>
        </span>
        <Button
          icon={<ReloadOutlined />}
          onClick={reload}
          style={{ float: "right", marginTop: "-7px" }}
        >
          Refresh
        </Button>
      </>
    );
  }

  return (
    <SettingBox title={render_title()} icon="database">
      {error != "" ? <ErrorDisplay error={error} /> : undefined}
      {render_body()}
    </SettingBox>
  );
};
