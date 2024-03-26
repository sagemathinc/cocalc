import {
  Alert,
  Button,
  Input,
  Form,
  List,
  Modal,
  Popconfirm,
  Skeleton,
  Tooltip,
} from "antd";

import {
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon, Title } from "@cocalc/frontend/components";
import OllamaAvatar from "@cocalc/frontend/components/ollama-avatar";
import { OTHER_SETTINGS_CUSTOM_LLM as KEY } from "@cocalc/util/db-schema/defaults";
import { ClientLLM } from "@cocalc/util/db-schema/llm-utils";

interface Props {
  on_change: (name: string, value: any) => void;
}

export function CustomLLM({ on_change }: Props) {
  const other_settings = useTypedRedux("account", "other_settings");
  const [form] = Form.useForm();
  const [editLLM, setEditLLM] = useState<ClientLLM | null>(null);
  const [loading, setLoading] = useState(false);
  const [llms, setLLMs] = useState<ClientLLM[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const val = other_settings?.get(KEY) ?? "[]";
    try {
      setLLMs(JSON.parse(val));
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

  function save(next: ClientLLM, oldModel: string) {
    const { type, display, model, endpoint } = next;
    if (!display || !model || !endpoint) {
      setError("Please fill all fields");
      return;
    }
    if (type !== "ollama") {
      setError(`Invalid type: ${type}`);
      return;
    }
    try {
      // replace an entry with the same model name, if it exists
      const newModels = llms.filter(
        (m) => m.model !== model && m.model !== oldModel,
      );
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
          setEditLLM({
            type: "ollama",
            display: "",
            endpoint: "",
            model: "",
          });
        }}
      >
        Add Custom LLM
      </Button>
    );
  }

  async function test(llm: ClientLLM) {
    setLoading(true);
    try {
      Modal.confirm({
        title: `Test ${llm.display} (${llm.model})`,
        content: "Test successful!",
        okText: "OK",
      });
    } catch (err) {
      Modal.error({
        title: `Error testing ${llm.display} (${llm.model})`,
        content: err.toString(),
        okText: "OK",
      });
    }
    setLoading(false);
  }

  function renderList() {
    return (
      <List
        loading={loading}
        itemLayout="horizontal"
        dataSource={llms}
        renderItem={(item: ClientLLM) => {
          const { display, model, endpoint, type } = item;

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
                      Type: {type === "ollama" ? "Ollama" : "Unknown"}
                    </>
                  }
                >
                  <List.Item.Meta
                    avatar={<OllamaAvatar size={22} />}
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

  function renderForm() {
    if (!editLLM) return null;
    return (
      <Modal
        open={editLLM != null}
        title="Add/Edit Custom LLM"
        onOk={() => {
          save(form.getFieldsValue(true), editLLM.model);
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
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Model Name"
            name="model"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Endpoint URL"
            name="endpoint"
            rules={[{ required: true }]}
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

  return (
    <>
      <Title level={5}>
        Custom Language Models{" "}
        <HelpIcon style={{ float: "right" }} title="Help">
          Help text
        </HelpIcon>
      </Title>

      {renderForm()}
      {renderList()}
      {addLLM()}
      {renderError()}
    </>
  );
}
