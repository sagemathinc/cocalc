import {
  Alert,
  Button,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Space,
  Tooltip,
} from "antd";
import { useWatch } from "antd/es/form/Form";
import { sortBy } from "lodash";
import { FormattedMessage, useIntl } from "react-intl";

import {
  CSS,
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  A,
  HelpIcon,
  Icon,
  RawPrompt,
  Text,
} from "@cocalc/frontend/components";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { OTHER_SETTINGS_USERDEFINED_LLM as KEY } from "@cocalc/util/db-schema/defaults";
import {
  LLM_PROVIDER,
  SERVICES,
  UserDefinedLLM,
  UserDefinedLLMService,
  isLLMServiceName,
  toUserLLMModelName,
} from "@cocalc/util/db-schema/llm-utils";
import { trunc, unreachable } from "@cocalc/util/misc";
import { Panel } from "@cocalc/frontend/antd-bootstrap";

// @cspell:ignore mixtral userdefined

interface Props {
  style?: CSS;
  on_change: (name: string, value: any) => void;
}

export function UserDefinedLLMComponent({ style, on_change }: Props) {
  const intl = useIntl();
  const user_defined_llm = useTypedRedux("customize", "user_defined_llm");
  const other_settings = useTypedRedux("account", "other_settings");
  const [form] = Form.useForm();
  const [editLLM, setEditLLM] = useState<UserDefinedLLM | null>(null);
  const [tmpLLM, setTmpLLM] = useState<UserDefinedLLM | null>(null);
  const [loading, setLoading] = useState(false);
  const [llms, setLLMs] = useState<UserDefinedLLM[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [needAPIKey, setNeedAPIKey] = useState(false);
  const [needEndpoint, setNeedEndpoint] = useState(false);

  const service: UserDefinedLLMService = useWatch("service", form);
  useEffect(() => {
    const v = service === "custom_openai" || service === "ollama";
    setNeedAPIKey(!v);
    setNeedEndpoint(v);
  }, [service]);

  useEffect(() => {
    setLoading(true);
    const val = other_settings?.get(KEY) ?? "[]";
    try {
      const data: UserDefinedLLM[] = JSON.parse(val);
      setLLMs(sortBy(data, "id"));
    } catch (e) {
      setError(`Error parsing custom LLMs: ${e}`);
      setLLMs([]);
    }
    setLoading(false);
  }, [other_settings?.get(KEY)]);

  useEffect(() => {
    if (editLLM != null) {
      form.setFieldsValue(editLLM);
    } else {
      form.resetFields();
    }
  }, [editLLM]);

  function getNextID(): number {
    let id = 0;
    llms.forEach((m) => (m.id > id ? (id = m.id) : null));
    return id + 1;
  }

  function save(next: UserDefinedLLM, oldID: number) {
    // trim each field in next
    for (const key in next) {
      if (typeof next[key] === "string") {
        next[key] = next[key].trim();
      }
    }
    // set id if not set
    next.id ??= getNextID();

    const { service, display, model, endpoint } = next;
    if (
      !display ||
      !model ||
      (needEndpoint && !endpoint) ||
      (needAPIKey && !next.apiKey)
    ) {
      setError("Please fill all fields – click the add button and fix it!");
      return;
    }
    if (!SERVICES.includes(service as any)) {
      setError(`Invalid service: ${service}`);
      return;
    }
    try {
      // replace an entry with the same ID, if it exists
      const newModels = llms.filter((m) => m.id !== oldID);
      newModels.push(next);
      on_change(KEY, JSON.stringify(newModels));
      setEditLLM(null);
    } catch (err) {
      setError(`Error saving custom LLM: ${err}`);
    }
  }

  function deleteLLM(model: string) {
    try {
      const newModels = llms.filter((m) => m.model !== model);
      on_change(KEY, JSON.stringify(newModels));
    } catch (err) {
      setError(`Error deleting custom LLM: ${err}`);
    }
  }

  function addLLM() {
    return (
      <Button
        block
        icon={<Icon name="plus-circle-o" />}
        onClick={() => {
          if (!error) {
            setEditLLM({
              id: getNextID(),
              service: "custom_openai",
              display: "",
              endpoint: "",
              model: "",
              apiKey: "",
            });
          } else {
            setEditLLM(tmpLLM);
            setError(null);
          }
        }}
      >
        <FormattedMessage
          id="account.user-defined-llm.add_button.label"
          defaultMessage="Add your own Language Model"
        />
      </Button>
    );
  }

  async function test(llm: UserDefinedLLM) {
    setLoading(true);
    Modal.info({
      closable: true,
      title: `Test ${llm.display} (${llm.model})`,
      content: <TestCustomLLM llm={llm} />,
      okText: "Close",
    });
    setLoading(false);
  }

  function renderList() {
    return (
      <List
        loading={loading}
        itemLayout="horizontal"
        dataSource={llms}
        renderItem={(item: UserDefinedLLM) => {
          const { display, model, endpoint, service } = item;
          if (!isLLMServiceName(service)) return null;

          return (
            <List.Item
              actions={[
                <Button
                  icon={<Icon name="pen" />}
                  type="link"
                  onClick={() => {
                    setEditLLM(item);
                  }}
                >
                  Edit
                </Button>,
                <Popconfirm
                  title={`Are you sure you want to delete the LLM ${display} (${model})?`}
                  onConfirm={() => deleteLLM(model)}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button icon={<Icon name="trash" />} type="link" danger>
                    Delete
                  </Button>
                </Popconfirm>,
                <Button
                  icon={<Icon name="play-circle" />}
                  type="link"
                  onClick={() => test(item)}
                >
                  Test
                </Button>,
              ]}
            >
              <Skeleton avatar title={false} loading={false} active>
                <Tooltip
                  title={
                    <>
                      Model: {model}
                      <br />
                      Endpoint: {endpoint}
                      <br />
                      Service: {service}
                    </>
                  }
                >
                  <List.Item.Meta
                    avatar={
                      <LanguageModelVendorAvatar
                        model={toUserLLMModelName(item)}
                      />
                    }
                    title={display}
                  />
                </Tooltip>
              </Skeleton>
            </List.Item>
          );
        }}
      />
    );
  }

  function renderExampleModel() {
    switch (service) {
      case "custom_openai":
      case "openai":
        return "'gpt-4o'";
      case "ollama":
        return "'llama3:latest', 'phi3:instruct', ...";
      case "anthropic":
        return "'claude-3-sonnet-20240229'";
      case "mistralai":
        return "'open-mixtral-8x22b'";
      case "google":
        return "'gemini-2.0-flash'";
      case "xai":
        return "'grok-4-1-fast-non-reasoning-16k'";
      default:
        unreachable(service);
        return "'llama3:latest'";
    }
  }

  function renderForm() {
    if (!editLLM) return null;
    return (
      <Modal
        open={editLLM != null}
        title="Edit Language Model"
        onOk={() => {
          const vals = form.getFieldsValue(true);
          setTmpLLM(vals);
          save(vals, editLLM.id);
          setEditLLM(null);
        }}
        onCancel={() => {
          setEditLLM(null);
        }}
      >
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ span: 8 }}
          wrapperCol={{ span: 16 }}
        >
          <Form.Item
            label="Display Name"
            name="display"
            rules={[{ required: true }]}
            help="e.g. 'MyLLM'"
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Service"
            name="service"
            rules={[{ required: true }]}
            help="Select the kind of server to talk to. Probably 'OpenAI API' or 'Ollama'"
          >
            <Select popupMatchSelectWidth={false}>
              {SERVICES.map((option) => {
                const { name, desc } = LLM_PROVIDER[option];
                return (
                  <Select.Option key={option} value={option}>
                    <Tooltip title={desc} placement="right">
                      <Text strong>{name}</Text>: {trunc(desc, 50)}
                    </Tooltip>
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item
            label="Model Name"
            name="model"
            rules={[{ required: true }]}
            help={`This depends on the available models. e.g. ${renderExampleModel()}.`}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Endpoint URL"
            name="endpoint"
            rules={[{ required: needEndpoint }]}
            help={
              needEndpoint
                ? "e.g. 'https://your.ollama.server:11434/' or 'https://api.openai.com/v1'"
                : "This setting is ignored."
            }
          >
            <Input disabled={!needEndpoint} />
          </Form.Item>
          <Form.Item
            label="API Key"
            name="apiKey"
            help="A secret string, which you got from the service provider."
            rules={[{ required: needAPIKey }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    );
  }

  function renderError() {
    if (!error) return null;
    return <Alert message={error} type="error" closable />;
  }

  const title = intl.formatMessage({
    id: "account.user-defined-llm.title",
    defaultMessage: "Bring your own Language Model",
  });

  function renderContent() {
    if (user_defined_llm) {
      return (
        <>
          {renderForm()}
          {renderList()}
          {addLLM()}
          {renderError()}
        </>
      );
    } else {
      return <Alert banner type="info" message="This feature is disabled." />;
    }
  }

  function renderHelpIcon() {
    return (
      <HelpIcon style={{ float: "right" }} maxWidth="300px" title={title}>
        <FormattedMessage
          id="account.user-defined-llm.info"
          defaultMessage={`This allows you to call a {llm} of your own.
            You either need an API key or run it on your own server.
            Make sure to click on "Test" to check, that the communication to the API actually works.
            Most likely, the type you are looking for is "Custom OpenAI" or "Ollama".`}
          values={{
            llm: (
              <A href={"https://en.wikipedia.org/wiki/Large_language_model"}>
                Large Language Model
              </A>
            ),
          }}
        />
      </HelpIcon>
    );
  }

  return (
    <Panel
      style={style}
      size={"small"}
      header={
        <>
          {title}
          {renderHelpIcon()}
        </>
      }
    >
      {renderContent()}
    </Panel>
  );
}

function TestCustomLLM({ llm }: { llm: UserDefinedLLM }) {
  const [querying, setQuerying] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>("Capital city of Australia?");
  const [reply, setReply] = useState<string>("");
  const [error, setError] = useState<string>("");

  async function doQuery() {
    setQuerying(true);
    setError("");
    setReply("");
    try {
      const llmStream = webapp_client.openai_client.queryStream({
        input: prompt,
        project_id: null,
        tag: "userdefined-llm-test",
        model: toUserLLMModelName(llm),
        system: "This is a test. Reply briefly.",
        maxTokens: 100,
      });

      let reply = "";
      llmStream.on("token", (token) => {
        if (token) {
          reply += token;
          setReply(reply);
        } else {
          setQuerying(false);
        }
      });

      llmStream.on("error", (err) => {
        setError(err?.toString());
        setQuerying(false);
      });
    } catch (e) {
      setError(e.message);
      setReply("");
      setQuerying(false);
    }
  }

  // TODO implement a button (or whatever) to query the backend and show the response in real time
  return (
    <Space direction="vertical">
      <Flex vertical={false} align="center" gap={5}>
        <Flex>Prompt: </Flex>
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onPressEnter={doQuery}
        />
        <Button loading={querying} type="primary" onClick={doQuery}>
          Test
        </Button>
      </Flex>
      {reply ? (
        <>
          Reply:
          <RawPrompt input={reply} />
        </>
      ) : null}
      {error ? <Alert banner message={error} type="error" /> : null}
    </Space>
  );
}
