/*
 *  This file is part of CoCalc: Copyright © 2021 – 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Datastore (only for kucalc and cocalc-onprem)

cSpell: words sshfs keyid, ignore creds ALPHANUM
*/

import {
  DeleteOutlined,
  EditOutlined,
  PlusCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tooltip,
  Typography,
} from "antd";
import { defineMessage, FormattedMessage, useIntl } from "react-intl";

import { Button as BSButton } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  useActions,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import {
  A,
  ErrorDisplay,
  Icon,
  SettingBox,
  Tip,
} from "@cocalc/frontend/components";
import Password, {
  PasswordTextArea,
} from "@cocalc/frontend/components/password";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { DOC_CLOUD_STORAGE_URL } from "@cocalc/util/consts/project";
import { DATASTORE_TITLE } from "@cocalc/util/db-schema/site-defaults";
import { unreachable } from "@cocalc/util/misc";
import { FLYOUT_PADDING } from "../page/flyouts/consts";
import { useProjectState } from "../page/project-state-hook";
import { useProjectHasInternetAccess } from "./has-internet-access-hook";
import { RestartProject } from "./restart-project";
import { DatastoreConfig as Config } from "./types";

const SECRET_TOOLTIP = defineMessage({
  id: "project.settings.datastore.secrets_info",
  defaultMessage: `<b>Secrets are hidden!</b>
  Either keep the field empty to retain the current secret – or enter a new secret to replace the existing one.`,
});

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
        const about = [`Key ID: ${v.keyid}`, `Bucket: ${v.bucket}`];
        if (v.host?.trim()) {
          about.push(`Host: ${v.host}`);
        }
        v.about = about.join("\n");
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
  mode?: "project" | "flyout";
  reloadTrigger?: number;
}

export const Datastore: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, mode = "project", reloadTrigger = 0 } = props;
  const isFlyout = mode === "flyout";
  const size = isFlyout ? "small" : undefined; // for buttons
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
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
  const [editMode, setEditMode] = useState<boolean>(false);
  const [form_readonly, set_form_readonly] =
    useState<boolean>(READONLY_DEFAULT);

  const [form_gcs] = Form.useForm();
  const [form_s3] = Form.useForm();
  const [form_sshfs] = Form.useForm();

  const form_layout = isFlyout
    ? { labelCol: { span: 8 }, wrapperCol: { span: 16 } }
    : { labelCol: { span: 6 }, wrapperCol: { span: 18 } };

  React.useEffect(() => {
    // if there is a change to that project running again, we clear the restart warning
    if (is_running && needs_restart) set_needs_restart(false);
  }, [is_running]);

  async function add(type: Config["type"]): Promise<void> {
    const common = { name: "", secret: "" };
    setEditMode(false);
    switch (type) {
      case "s3":
        set_new_config({
          ...common,
          type: "s3",
          keyid: "",
          bucket: "",
          host: "",
        });
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
    if (!config.name.trim()) {
      set_error(`You have to set a "name".`);
      return;
    }
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
      setEditMode(false);
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
      if (err) {
        console.error(err);
        set_error(err.toString());
      }
    } finally {
      set_loading(false);
    }
  }

  // reload once after mounting and when the reload prop changes
  React.useEffect(() => {
    reload();
  }, [reloadTrigger]);

  function getCurrentForm() {
    if (new_config == null) return;
    const { type } = new_config;
    switch (type) {
      case "s3":
        return form_s3;
      case "gcs":
        return form_gcs;
      case "sshfs":
        return form_sshfs;
      default:
        unreachable(type);
    }
  }

  // when we change the new_config data, we also want to reflect that in the corresponding form values
  React.useEffect(() => {
    if (new_config == null) return;
    getCurrentForm()?.setFieldsValue(new_config);
  }, [new_config]);

  function edit(record: Config) {
    if (record == null) return;
    const conf: Config = { ...record };
    conf.secret = "";
    delete conf.about;
    set_new_config(conf);
    set_form_readonly(conf.readonly ?? READONLY_DEFAULT);
    setEditMode(true);
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

  function render_instructions() {
    if (!needs_restart) return null;

    return (
      <Alert
        type={"warning"}
        showIcon={false}
        banner
        message={
          <div>
            <Typography.Text strong>
              <FormattedMessage
                id="project.settings.datastore.restart-instructions"
                defaultMessage={
                  "Restart your project for these changes to take effect."
                }
              />
            </Typography.Text>
            <span style={{ float: "right" }}>
              <RestartProject
                project_id={project_id}
                text={`${intl.formatMessage(labels.restart)}…`}
                size={"small"}
              />
            </span>
          </div>
        }
      />
    );
  }

  function render_action_buttons(_, record) {
    const placement = isFlyout ? "right" : "bottom";
    return (
      <Space.Compact
        size={size}
        direction={isFlyout ? "vertical" : "horizontal"}
      >
        <Tooltip
          title={`Modify ${record.name}'s configuration.`}
          placement={placement}
        >
          <Button
            size={size}
            onClick={() => edit(record)}
            icon={<EditOutlined />}
          ></Button>
        </Tooltip>

        <Tooltip title={`Open ${record.name} in Files`} placement={placement}>
          <Button
            size={size}
            onClick={() => open(record)}
            icon={<Icon name="external-link" />}
          ></Button>
        </Tooltip>

        <Popconfirm
          title={`Delete ${record.name}?`}
          onConfirm={() => confirm_del(record.name)}
          okText={intl.formatMessage(labels.yes)}
          cancelText={intl.formatMessage(labels.no)}
        >
          <Tooltip title={`Delete ${record.name}.`} placement={placement}>
            <Button size={size} icon={<DeleteOutlined />}></Button>{" "}
          </Tooltip>
        </Popconfirm>
      </Space.Compact>
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
          render={(name, record) => (
            <>
              <Typography.Text strong>{name}</Typography.Text>
              <br />({record.type})
            </>
          )}
        />
        <Table.Column<Config>
          key="about"
          title="About"
          dataIndex="about"
          render={(about, record) => (
            <>
              <div style={{ whiteSpace: "pre", fontSize: "80%" }}>{about}</div>
              <Tip
                title="Read-only"
                tip="An open lock indicates the cloud store / remote file system will be mounted with read/write rights, while a closed lock means it will be mounted with read-only options."
              >
                <div style={{ fontSize: "90%" }}>
                  <Icon
                    name={record.readonly ?? false ? "lock" : "lock-open"}
                  />{" "}
                  {record.readonly ? "Read-only" : "Read/write"}
                </div>
              </Tip>
            </>
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
    const C = isFlyout ? Space.Compact : Space;
    return (
      <C
        size={size}
        style={{
          marginBottom: "10px",
          ...(isFlyout ? { padding: "5px" } : {}),
        }}
      >
        <Button
          size={size}
          icon={<PlusCircleOutlined />}
          onClick={() => add("sshfs")}
          type={"primary"}
          disabled={editing}
        >
          SSHFS
        </Button>

        <Button
          size={size}
          icon={<PlusCircleOutlined />}
          onClick={() => add("gcs")}
          type={"primary"}
          disabled={editing}
        >
          GCS
        </Button>

        <Button
          size={size}
          icon={<PlusCircleOutlined />}
          onClick={() => add("s3")}
          type={"primary"}
          disabled={editing}
        >
          S3
        </Button>

        {isFlyout ? (
          <BSButton
            bsSize={"xsmall"}
            active={show_help}
            onClick={() => set_show_help((val) => !val)}
          >
            Help
          </BSButton>
        ) : (
          <Form.Item label="Help:" style={{ marginBottom: 0 }}>
            <Switch
              size={size}
              checked={show_help}
              onChange={(val) => set_show_help(val)}
            />
          </Form.Item>
        )}
      </C>
    );
  }

  function render_help_content() {
    return (
      <FormattedMessage
        id="project.settings.datastore-help"
        defaultMessage={`
        <p>
          This configuration allows you to mount a cloud store (a remote
          collection of file-like objects) or a remote file-system into a
          CoCalc project. The configuration is passed on to the back-end and
          activated upon project startup. The project must have access to
          the internet (via membership).
        </p>
        <p>
          If everything works out fine, you will be able to access the data
          at "/data/[name]". As a convenience and if ~/data is not taken yet,
          a symlink will point from ~/data/[name] to the mounted  directory.
        </p>
        <p>
          For security, the secret stays hidden. Keep the credentials text
          empty in order to keep it as it is – otherwise it gets replaced by
          the newly entered value.
        </p>
        <p>
          More information: {doc}
        </p>`}
        values={{
          p: (c) => <p>{c}</p>,
          doc: (
            <A href={DOC_CLOUD_STORAGE_URL}>
              {projectLabel} Settings / Cloud Storage & Remote File Systems
            </A>
          ),
        }}
      />
    );
  }

  function render_help() {
    if (!show_help) return;
    return (
      <Alert
        showIcon={false}
        banner
        type="info"
        message={<div>{render_help_content()}</div>}
      />
    );
  }

  function render_internet_warning() {
    if (has_internet) return;
    return (
      <Alert
        type="error"
        banner
        showIcon={false}
        message={
          <div>
            <h3>No internet access</h3>
            <p>
              You need the "internet access" quota enabled (via membership or
              membership) to access cloud storage or remote file
              systems.
            </p>
          </div>
        }
      />
    );
  }

  function cancel() {
    set_new_config(null);
    set_error("");
    setEditMode(false);
  }

  function process_failure(err: { errorFields: { name; errors: string[] }[] }) {
    const msg: string[] = err.errorFields?.map(
      ({ name, errors }) => `- ${name}: ${errors.join(" ")}`,
    );
    set_error(msg.join("\n"));
  }

  async function save_config(values: any): Promise<void> {
    values.readonly = form_readonly;
    try {
      await set(values);
    } catch (err) {
      if (err) set_error(err);
    }
  }

  function render_forms(new_config: Config) {
    const { type } = new_config;
    const props = {
      form_layout,
      form_readonly,
      set_form_readonly,
      cancel,
      process_failure,
      isFlyout,
      editMode,
    } as const;
    switch (type) {
      case "s3":
        return <NewS3 form_s3={form_s3} {...props} />;
      case "gcs":
        return <NewGCS form_gcs={form_gcs} {...props} />;
      case "sshfs":
        return <NewSSHFS form_sshfs={form_sshfs} {...props} />;
      default:
        unreachable(type);
    }
  }

  function render_new_config() {
    if (new_config == null) return;
    const title = (
      <>
        {new_config.type.toUpperCase()}{" "}
        {intl.formatMessage(labels.configuration)} (
        <A href={DOC_CLOUD_STORAGE_URL}>Help</A>)
      </>
    );
    return (
      <Modal
        open={new_config != null}
        title={title}
        okText={intl.formatMessage(labels.save)}
        cancelText={intl.formatMessage(labels.cancel)}
        onOk={() => {
          const vals = getCurrentForm()?.getFieldsValue(true);
          save_config(vals);
        }}
        onCancel={cancel}
      >
        {render_forms(new_config)}
        {error != "" ? <ErrorDisplay banner error={error} /> : undefined}
      </Modal>
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
        <span>{DATASTORE_TITLE}</span>
        <Button
          icon={<ReloadOutlined />}
          onClick={reload}
          style={{ float: "right", marginTop: "-7px" }}
        >
          {intl.formatMessage(labels.reload)}
        </Button>
      </>
    );
  }

  if (isFlyout) {
    return (
      <>
        {error != "" ? <ErrorDisplay banner error={error} /> : undefined}
        {render_internet_warning()}
        {render_body()}
      </>
    );
  } else {
    return (
      <SettingBox title={render_title()} icon="database">
        {error != "" ? <ErrorDisplay error={error} /> : undefined}
        {render_internet_warning()}
        {render_body()}
      </SettingBox>
    );
  }
});

function FormName() {
  const intl = useIntl();

  return (
    <Form.Item
      label="Name"
      name="name"
      rules={RULE_ALPHANUM}
      help={intl.formatMessage({
        id: "project.settings.datastore.form.name.help",
        defaultMessage: "Short, alphanumeric identifier. e.g. 'foo'",
      })}
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

function FormBottom({ form_readonly, set_form_readonly }) {
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
    </>
  );
}

function NewSSHFS({
  form_sshfs,
  form_layout,
  form_readonly,
  set_form_readonly,
  process_failure,
  isFlyout,
  editMode,
}) {
  const intl = useIntl();

  const pk_help =
    "This must be a passphrase-less private key, which allows to connect to the remove OpenSSH server.";
  const pk_example =
    "This must be a passphrase-less private key!\n\n-----BEGIN OPENSSH PRIVATE KEY-----\naRandomLookingString...\n...\n...\n-----END OPENSSH PRIVATE KEY-----";
  return (
    <ConfigForm
      form={form_sshfs}
      type={"sshfs"}
      form_layout={form_layout}
      process_failure={process_failure}
      isFlyout={isFlyout}
    >
      <FormName />
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
        label="Remote Path"
        name="path"
        tooltip="The full remote path to mount, defaults to '/home/[user]'"
      >
        <Input placeholder="" />
      </Form.Item>
      <Form.Item
        label="Private Key"
        name="secret"
        tooltip={pk_help}
        help={editMode ? intl.formatMessage(SECRET_TOOLTIP) : undefined}
      >
        <PasswordTextArea rows={5} placeholder={pk_example} visibilityToggle />
      </Form.Item>
      <FormBottom
        form_readonly={form_readonly}
        set_form_readonly={set_form_readonly}
      />
    </ConfigForm>
  );
}

function NewGCS({
  form_gcs,
  form_layout,
  form_readonly,
  set_form_readonly,
  process_failure,
  isFlyout,
  editMode,
}) {
  const intl = useIntl();

  const creds_help =
    "JSON formatted content of the service account credentials file.";
  const msg_bucket = "Name of the S3 bucket";
  return (
    <ConfigForm
      form={form_gcs}
      type={"gcs"}
      form_layout={form_layout}
      process_failure={process_failure}
      isFlyout={isFlyout}
    >
      <FormName />
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
        tooltip={creds_help}
        help={editMode ? intl.formatMessage(SECRET_TOOLTIP) : undefined}
      >
        <PasswordTextArea rows={5} placeholder={creds_help} visibilityToggle />
      </Form.Item>
      <FormBottom
        form_readonly={form_readonly}
        set_form_readonly={set_form_readonly}
      />
    </ConfigForm>
  );
}

function NewS3({
  form_s3,
  form_layout,
  form_readonly,
  set_form_readonly,
  process_failure,
  isFlyout,
  editMode,
}) {
  const intl = useIntl();

  return (
    <ConfigForm
      form={form_s3}
      type={"s3"}
      form_layout={form_layout}
      process_failure={process_failure}
      isFlyout={isFlyout}
    >
      <FormName />
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
        tooltip={`The secret key.`}
        help={editMode ? intl.formatMessage(SECRET_TOOLTIP) : undefined}
      >
        <Password placeholder="fie$kf2&ifw..." visibilityToggle />
      </Form.Item>
      <Form.Item
        label="Host"
        name="host"
        tooltip="Optional. Empty string or an URL like https://minio.server.com"
        help="If not set (empty string), then it connects with AWS S3. Otherwise enter the URL of the S3 server."
      >
        <Input placeholder="Optional. Leave empty or e.g. https://minio.server.com/" />
      </Form.Item>
      <FormBottom
        form_readonly={form_readonly}
        set_form_readonly={set_form_readonly}
      />
    </ConfigForm>
  );
}

function ConfigForm({
  form_layout,
  form,
  process_failure,
  isFlyout,
  children,
}: {
  form_layout;
  form;
  process_failure;
  isFlyout;
  children;
  type;
}) {
  return (
    <Form
      {...form_layout}
      form={form}
      onFinishFailed={process_failure}
      style={isFlyout ? { paddingRight: FLYOUT_PADDING } : undefined}
      size="small"
    >
      {children}
    </Form>
  );
}
