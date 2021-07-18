/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Datastore (kucalc only!)
*/

import {
  React,
  useState,
  useIsMountedRef,
  useActions,
} from "../../app-framework";
import { webapp_client } from "../../webapp-client";
import { useProjectState } from "../page/project-state-hook";
import { useProjectHasInternetAccess } from "./has-internet-access-hook";
import { ReloadOutlined, DeleteOutlined } from "@ant-design/icons";
import { PlusCircleOutlined, EditOutlined } from "@ant-design/icons";
import { Button, Table, Typography, Form, Input, Checkbox } from "antd";
import { Space, Alert, Switch, Popconfirm, Tooltip } from "antd";
import { ErrorDisplay, SettingBox, Icon, Tip, A } from "../../r_misc";
import { RestartProject } from "./restart-project";
import { unreachable } from "smc-util/misc";
import { DUMMY_SECRET } from "./const";
import { DatastoreConfig as Config } from "./types";

const SECRET_TOOLTIP = `\nSecrets can't be edited. Either keep "${DUMMY_SECRET}" as it is to retain the current value, or enter a new secret to replace the existing one.`;

const DOC = "https://doc.cocalc.com/project-settings.html#datastore";

const RULE_REQUIRED = [
  { required: true, message: "This is a required field." },
];

const RULE_ALPHANUM = [
  RULE_REQUIRED[0],
  {
    pattern: /^[0-9a-z-_.]{1,63}$/,
    message:
      'Must be lowercase alphanumeric and no spaces, i.e. a-z, 0-9, "-", "." and "_" are allowed. Max. 63 characters long.',
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
        v.about = [`Key ID: ${v.keyid}`, `Bucket: ${v.bucket}`].join("\n");
        break;
      case "gcs":
        v.about = `Bucket: ${v.bucket}`;
        break;
      case "sshfs":
        v.about = [
          `User: ${v.user}`,
          `Host: ${v.host}`,
          `Path: ${v.path ?? `/user/${v.user}`}`,
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

export const Datastore: React.FC<Props> = React.memo((props: Props) => {
  const { project_id } = props;
  const project_actions = useActions({ project_id });
  const state = useProjectState(project_id);
  const has_internet = useProjectHasInternetAccess(project_id);
  const is_running = state.get("state") === "running";
  const [needs_restart, set_needs_restart] = useState<boolean>(false);
  const [loading, set_loading] = useState<boolean>(false);
  const [error, set_error] = useState<string>("");
  const [new_config, set_new_config] = useState<Config | null>(null);
  const [show_help, set_show_help] = useState<boolean>(false);
  const editing = new_config != null;
  const is_mounted_ref = useIsMountedRef();
  const [configs, set_configs] = useState<Config[]>([]);
  const [form_readonly, set_form_readonly] =
    useState<boolean>(READONLY_DEFAULT);

  const [form_gcs] = Form.useForm();
  const [form_s3] = Form.useForm();
  const [form_sshfs] = Form.useForm();

  React.useEffect(() => {
    // if there is a change to that project running again, we clear the restart warning
    if (is_running && needs_restart) set_needs_restart(false);
  }, [is_running]);

  async function add(type: Config["type"]): Promise<void> {
    const common = { name: "", secret: "" };
    switch (type) {
      case "s3":
        set_new_config({ ...common, type: "s3", keyid: "", bucket: "" });
        break;
      case "gcs":
        set_new_config({ ...common, type: "gcs", bucket: "" });
        break;
      case "sshfs":
        set_new_config({
          ...common,
          type: "sshfs",
          user: "",
          host: "",
          path: "",
        });
        break;
      default:
        unreachable(type);
    }
    set_form_readonly(READONLY_DEFAULT);
  }

  function render_instructions() {
    if (!needs_restart) return null;

    return (
      <Alert
        type={"warning"}
        message={
          <div>
            <Typography.Text strong>
              Restart your project for these changes to take effect.
            </Typography.Text>
            <span style={{ float: "right" }}>
              <RestartProject
                project_id={project_id}
                text={"Restart…"}
                bsStyle={"default"}
                bsSize={"small"}
              />
            </span>
          </div>
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
      set_error(`Sorry, you can't use the name "delete"`);
      return;
    }
    // we have to check if the name isn't ""
    const name_change = new_config?.name && new_config.name != config.name;
    // if we edit a datastore's name, we have to pick the secret from the one that's going to be deleted
    if (new_config != null && name_change) {
      config.__old_name = new_config.name;
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
      set_needs_restart(true);
      set_new_config(null); // hide form
      if (!name_change) reload(); // refresh what we just saved ...
    }

    // if we *edit* an entry, get rid of the old one
    if (new_config != null && name_change) {
      del(new_config.name);
      reload();
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
      set_needs_restart(true);
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
      // besides a possible error, there might still be useful data
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

  // when we change the new_config data, we also want to reflect that in the corresponding form values
  React.useEffect(() => {
    if (new_config == null) return;
    switch (new_config.type) {
      case "s3":
        form_s3.setFieldsValue(new_config);
        break;
      case "gcs":
        form_gcs.setFieldsValue(new_config);
        break;
      case "sshfs":
        form_sshfs.setFieldsValue(new_config);
        break;
      default:
        unreachable(new_config);
    }
  }, [new_config]);

  function edit(record) {
    if (record == null) return;
    const conf: Config = Object.assign({}, record);
    conf.secret = DUMMY_SECRET;
    set_new_config(conf);
    set_form_readonly(conf.readonly ?? READONLY_DEFAULT);
  }

  function render_list_ro_title() {
    return (
      <Tip
        title="Read-only"
        tip="An open lock indicates the cloud store / remote file system will be mounted with read/write rights, while a closed lock means it will be mounted with read-only options."
      >
        <Icon name="edit" />
      </Tip>
    );
  }

  async function confirm_del(name) {
    try {
      del(name);
    } catch (err) {
      set_error(err);
    }
  }

  function open(record) {
    project_actions?.open_directory(`.smc/root/data/${record.name}/`);
  }

  function render_action_buttons(_, record) {
    return (
      <Space>
        <Tooltip title={`Modify ${record.name}'s configuration.`}>
          <Button onClick={() => edit(record)} icon={<EditOutlined />}></Button>
        </Tooltip>

        <Tooltip title={`Open ${record.name} in Files`}>
          <Button
            onClick={() => open(record)}
            icon={<Icon name="external-link" />}
          ></Button>
        </Tooltip>

        <Popconfirm
          title={`Delete ${record.name}?`}
          onConfirm={() => confirm_del(record.name)}
          okText="Yes"
          cancelText="No"
        >
          <Tooltip title={`Delete ${record.name}.`}>
            <Button icon={<DeleteOutlined />}></Button>{" "}
          </Tooltip>
        </Popconfirm>
      </Space>
    );
  }

  function render_list() {
    return (
      <Table<Config> dataSource={configs} loading={loading} pagination={false}>
        <Table.Column<Config>
          key="name"
          title={"Name"}
          dataIndex="name"
          ellipsis={true}
          render={(name) => <Typography.Text strong>{name}</Typography.Text>}
        />
        <Table.Column<Config> key="type" title="Type" dataIndex="type" />
        <Table.Column<Config>
          key="about"
          title="About"
          dataIndex="about"
          render={(about) => (
            <div style={{ whiteSpace: "pre", fontSize: "80%" }}>{about}</div>
          )}
        />
        <Table.Column<Config>
          key="readonly"
          title={render_list_ro_title()}
          dataIndex="readonly"
          align={"right"}
          render={(_, record) => (
            <Icon name={record.readonly ?? false ? "lock" : "lock-open"} />
          )}
        />
        <Table.Column<Config>
          key="actions"
          title="Actions"
          dataIndex="actions"
          render={render_action_buttons}
          align={"right"}
        />
      </Table>
    );
  }

  function render_controls() {
    return (
      <Space style={{ marginBottom: "10px" }}>
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
      </Space>
    );
  }

  function render_help() {
    if (!show_help) return;
    return (
      <Alert
        type="info"
        message={
          <div>
            <p>
              This configuration allows you to mount a cloud store (a remote
              collection of file-like objects) or a remote file-system into a
              CoCalc project. The configuration is passed on to the back-end and
              activated upon project startup. The project must have access to
              the internet (quota "internet").
            </p>
            <p>
              If everything works out fine, you will be able to access the data
              at "/data/[name]". As a convenience, it's possible to let a
              symlink point from the project's home directory to the "/data"
              directory.
            </p>
            <p>
              When editing, the secret stays hidden. Keep the dummy text{" "}
              <Typography.Text code>{DUMMY_SECRET}</Typography.Text> as it is in
              order to not modify it – otherwise it gets replaced by the newly
              entered value.
            </p>
            <p>
              More information:{" "}
              <A href={DOC}>Project Settings / Cloud storage & remote file systems</A>
            </p>
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
              "internet access" quota. Otherwise you can't access cloud storage
              or remote file systems.
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

  function cancel() {
    set_new_config(null);
    set_error("");
  }

  function render_form_bottom() {
    // TODO: in general, I don't know to back the readonly boolean with the form
    // that's why this is a control setting a state, and some extras around it
    return (
      <>
        <Form.Item label="Read-only" name="readonly">
          <Checkbox
            checked={form_readonly}
            onChange={(e) => set_form_readonly(e.target.checked)}
          />
        </Form.Item>
        <Form.Item {...form_layout_tail}>
          <Space>
            <Button type="primary" htmlType="submit">
              Save
            </Button>
            <Button onClick={cancel}>Cancel</Button>
          </Space>
        </Form.Item>
      </>
    );
  }

  function render_form_name() {
    return (
      <Form.Item
        label="Name"
        name="name"
        rules={RULE_ALPHANUM}
        tooltip={
          <div>
            Choose a name.
            <br />
            It will be mounted at{" "}
            <code style={{ color: "white" }}>/data/[name]</code>.
          </div>
        }
      >
        <Input placeholder="" />
      </Form.Item>
    );
  }

  function process_failure(err: { errorFields: { name; errors: string[] }[] }) {
    const msg: string[] = err.errorFields?.map(
      ({ name, errors }) => `- ${name}: ${errors.join(" ")}`
    );
    set_error(msg.join("\n"));
  }

  async function form_finish(values: any, type): Promise<void> {
    values.readonly = form_readonly;
    values.type = type;
    try {
      await set(values);
    } catch (err) {
      if (err) set_error(err);
    }
  }

  function ConfigForm(props) {
    return (
      <Form
        {...form_layout}
        form={props.form}
        onFinish={(v) => form_finish(v, props.type)}
        onFinishFailed={process_failure}
      >
        {props.children}
      </Form>
    );
  }

  function render_new_gcs() {
    const creds_help =
      "JSON formatted content of the service account credentials file.";
    const msg_bucket = "Name of the S3 bucket";
    return (
      <ConfigForm form={form_gcs} type={"gcs"}>
        {render_form_name()}
        <Form.Item
          label="Bucket"
          name="bucket"
          rules={RULE_ALPHANUM}
          tooltip={msg_bucket}
        >
          <Input placeholder="name-of-bucket-01" />
        </Form.Item>
        <Form.Item
          label="Credentials"
          name="secret"
          rules={RULE_REQUIRED}
          tooltip={creds_help + SECRET_TOOLTIP}
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
          rules={RULE_ALPHANUM}
          tooltip="The bucket"
        >
          <Input placeholder="name-of-bucket-01" />
        </Form.Item>
        <Form.Item
          label="Key ID"
          name="keyid"
          rules={RULE_REQUIRED}
          tooltip="The Key ID"
        >
          <Input placeholder="AFiwFw892...." />
        </Form.Item>
        <Form.Item
          label="Secret"
          name="secret"
          rules={RULE_REQUIRED}
          tooltip={"The secret key" + SECRET_TOOLTIP}
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
      "This must be a passphrase-less private key!\n\n-----BEGIN OPENSSH PRIVATE KEY-----\naNmQfie...\n...\n...\n-----END OPENSSH PRIVATE KEY-----";
    return (
      <ConfigForm form={form_sshfs} type={"sshfs"}>
        {render_form_name()}
        <Form.Item
          label="User"
          name="user"
          rules={RULE_REQUIRED}
          tooltip="The username in [user]@[host]"
        >
          <Input placeholder="foo..." />
        </Form.Item>
        <Form.Item
          label="Host"
          name="host"
          rules={RULE_REQUIRED}
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
          rules={RULE_REQUIRED}
          tooltip={pk_help + SECRET_TOOLTIP}
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
        <span>&nbsp;</span>
        <h3 style={{ textAlign: "center" }}>
          <Typography.Text strong>
            {new_config.type.toUpperCase()}
          </Typography.Text>{" "}
          configuration
        </h3>
        {new_config.type === "s3" && render_new_s3()}
        {new_config.type === "gcs" && render_new_gcs()}
        {new_config.type === "sshfs" && render_new_sshfs()}
      </>
    );
  }

  function render_body() {
    return (
      <>
        {render_controls()}
        {render_help()}
        {render_new_config()}
        {render_instructions()}
        <span>&nbsp;</span>
        {render_list()}
      </>
    );
  }

  function render_title() {
    return (
      <>
        <span>
          Cloud storage & remote file-systems
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
});
