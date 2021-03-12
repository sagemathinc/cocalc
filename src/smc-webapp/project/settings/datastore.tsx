/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Datastore (kucalc only!)
*/

import { React, useState, useIsMountedRef } from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { useProjectState } from "../page/project-state-hook";
import { useProjectHasInternetAccess } from "./has-internet-access-hook";
import {
  ReloadOutlined,
  DeleteOutlined,
  PlusCircleOutlined,
  EditOutlined,
} from "@ant-design/icons";
import { Button, Table, Typography, Form, Input, Checkbox } from "antd";
import { Space as AntdSpace, Alert, Switch, Popconfirm } from "antd";
import { ErrorDisplay, SettingBox, Space } from "../../r_misc";
import { unreachable } from "smc-util/misc";
// import * as jsonic from "jsonic";

interface ConfigCommon {
  name: string; // [a-z0-9-_]
  key?: string; // equal to name, for antd only
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
function raw2configs(raw: { [name: string]: Config }): Config[] {
  const ret: Config[] = [];
  for (const [k, v] of Object.entries(raw)) {
    v.name = k;
    v.key = k; // for antd, to have unique rows
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
  const state = useProjectState(project_id);
  const has_internet = useProjectHasInternetAccess(project_id);
  const is_running = state.get("state") === "running";
  // const env = useRedux(["projects", "project_map", project_id, "env"]);
  const [needs_restart, set_needs_restart] = useState<boolean>(false);
  const [loading, set_loading] = useState<boolean>(false);
  const [error, set_error] = useState<string>("");
  const [new_config, set_new_config] = useState<Config | null>(null);
  const [show_help, set_show_help] = useState<boolean>(false);
  const editing = new_config != null;
  const is_mounted_ref = useIsMountedRef();
  const [configs, set_configs] = useState<Config[]>([]);
  const [form_readonly, set_form_readonly] = useState<boolean>(
    READONLY_DEFAULT
  );

  const [form_gcs] = Form.useForm();
  const [form_s3] = Form.useForm();
  const [form_sshfs] = Form.useForm();

  React.useEffect(() => {
    // if there is a change to that project running again, we clear the restart warning
    if (is_running) set_needs_restart(false);
  }, [is_running]);

  async function add(type: Config["type"]): Promise<void> {
    switch (type) {
      case "s3":
        set_new_config({ type: "s3", name: "", keyid: "", bucket: "" });
        break;
      case "gcs":
        set_new_config({ type: "gcs", name: "", bucket: "" });
        break;
      case "sshfs":
        set_new_config({
          type: "sshfs",
          name: "",
          user: "",
          host: "",
          path: "",
        });
        break;
      default:
        unreachable(type);
    }
    set_needs_restart(true);
    set_form_readonly(READONLY_DEFAULT);
  }

  function render_instructions() {
    if (!needs_restart) return null;

    return (
      <Alert
        type={"warning"}
        message={
          <Typography.Text strong>
            Restart your project for these changes to take effect.
          </Typography.Text>
        }
      />
    );
  }

  // retrieve all datastore configurations – post-processing in reload()
  async function get() {
    const query = {
      project_datastore: {
        project_id,
        addons: { datastore: null },
      },
    };
    return (await webapp_client.query({ query })).query.project_datastore;
  }

  // send the new data to the database
  async function set(config: any) {
    if (config.name == "delete") {
      set_error(`Sorry, you can't name the datastore "delete"`);
      return;
    }
    // the hub will process the config, we just have to do this here to send it
    const query = {
      project_datastore: {
        project_id,
        addons: { datastore: config },
      },
    };
    const res = await webapp_client.query({ query });
    if (res.event == "error") {
      set_error(`Problem saving information: ${res.error}`);
    } else {
      set_new_config(null); // hide form
      reload(); // refresh what we just saved ...
    }
  }

  // delete one particular configuration with the given name
  async function del(name: string) {
    const query = {
      project_datastore: {
        project_id,
        addons: { datastore: { delete: name } },
      },
    };
    const res = await webapp_client.query({ query });
    if (res.event == "error") {
      set_error(`Problem deleting: ${res.error}`);
    } else {
      reload(); // refresh what we just modified ...
    }
  }

  async function reload() {
    try {
      set_loading(true);
      set_error("");
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

  React.useEffect(() => {
    if (new_config == null) return;
    const conf = Object.assign({}, new_config);
    switch (new_config.type) {
      case "s3":
        form_s3.setFieldsValue(conf);
        break;
      case "gcs":
        form_gcs.setFieldsValue(conf);
        break;
      case "sshfs":
        form_sshfs.setFieldsValue(conf);
        break;
      default:
        unreachable(new_config);
    }
  }, [new_config]);

  function render_list() {
    return (
      <Table<Config> dataSource={configs} loading={loading} pagination={false}>
        <Table.Column<Config> key="type" title="Type" dataIndex="type" />
        <Table.Column<Config> key="name" title="Name" dataIndex="name" />
        <Table.Column<Config>
          key="about"
          title="About"
          dataIndex="about"
          render={(about) => (
            <div style={{ whiteSpace: "pre", fontSize: "80%" }}>{about}</div>
          )}
        />
        <Table.Column<Config>
          key="actions"
          title="Actions"
          dataIndex="actions"
          render={(_, record) => (
            <AntdSpace>
              <Button
                onClick={() => set_new_config(record)}
                icon={<EditOutlined />}
              ></Button>
              <Popconfirm
                title={`Delete ${record.name}?`}
                onConfirm={() => del(record.name)}
                okText="Yes"
                cancelText="No"
              >
                <Button icon={<DeleteOutlined />}></Button>
              </Popconfirm>
            </AntdSpace>
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

  function render_internet_warning() {
    if (has_internet) return;
    return (
      <Alert
        type="error"
        message={
          <div>
            <h3>No internet access</h3>
            <p>
              You need to have your project upgraded in order to activate the
              "internet access" quota. Otherwise you can't access datastores.
            </p>
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
    //
    // save {"name":"n","user":"asdf","host":"host","path":"/my/path","secret":"private\nkey","readonly":false}
    return (
      <Form
        {...form_layout}
        form={props.form}
        onFinish={(values: any) => {
          values.readonly = form_readonly;
          values.type = props.type;
          set(values);
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
          label="Remote path"
          name="path"
          tooltip="The full remote path to mount, defaults to '/home/[user]'"
        >
          <Input placeholder="" />
        </Form.Item>
        <Form.Item
          label="Private Key"
          name="secret"
          rules={rule_required}
          tooltip={pk_help}
        >
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
      {render_internet_warning()}
      {render_body()}
    </SettingBox>
  );
};
