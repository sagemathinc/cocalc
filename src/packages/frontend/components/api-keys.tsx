/*
React component for managing a list of api keys.

Applications:

 - the keys for a project
 - the keys for an account
*/

import { Icon } from "./icon";
import CopyToClipBoard from "./copy-to-clipboard";
import { useState, useEffect } from "react";
import { Alert, Table, Button, Popconfirm, Form, Input, Modal } from "antd";
import { ColumnsType } from "antd/es/table";
const { useForm } = Form;

export interface ApiKeyInfo {
  name: string;
  trunc: string;
  used?: number;
}

interface Props {
  // Manage is a function that lets you get all api keys, delete a single api key,
  // or create an api key.
  // - If you call manage with input "get" it will return a Javascript array ApiKeyInfo[]
  //   of all your api keys, with each api key represented as an object {name, trunc, used?}
  //   as defined above.  The actual key itself is not returned, and trunc is a truncated
  //   version of the key used for display.
  // - If you call manage with input "delete" and trunc set to the truncated version of an
  //   api key, then that key will get deleted.
  // - If you call manage with input "regenerate", then a new api key is created and returned
  //   as a single string. This is the one and only time the user can see this api key.
  // - If call with edit and both name and trunc set, changes the key determined by trunc
  //   to have the given name.
  manage: (opts: {
    action: "get" | "delete" | "regenerate" | "edit";
    trunc?: string;
    name?: string;
  }) => Promise<ApiKeyInfo[] | string | undefined>;
}

export default function ApiKeys({ manage }: Props) {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingKey, setEditingKey] = useState<string | undefined>(undefined);
  const [addModalVisible, setAddModalVisible] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  const [form] = useForm();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAllApiKeys();
  }, []);

  const getAllApiKeys = async () => {
    setLoading(true);
    try {
      const response = await manage({ action: "get" });
      setApiKeys(response as ApiKeyInfo[]);
      setLoading(false);
      setError(null);
    } catch (err) {
      setLoading(false);
      setError(err.message || "An error occurred");
    }
  };

  const deleteApiKey = async (trunc: string) => {
    try {
      await manage({ action: "delete", trunc });
      getAllApiKeys();
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const editApiKey = async (trunc: string, name: string) => {
    try {
      await manage({ action: "edit", trunc, name });
      getAllApiKeys();
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const createApiKey = async (name: string) => {
    try {
      const response: string = (await manage({
        action: "regenerate",
        name,
      })) as any;
      setAddModalVisible(false);
      getAllApiKeys();

      Modal.success({
        width: "600px",
        title: "New API key",
        content: (
          <>
            <div>
              Save this secret key somewhere safe. You won't be able to view it
              again here. If you lose this secret key, you'll need to generate a
              new one.
            </div>
            <div style={{ marginTop: 16 }}>
              <strong>New API Key</strong> <CopyToClipBoard value={response} />
            </div>
          </>
        ),
      });
      setError(null);
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const columns: ColumnsType<ApiKeyInfo> = [
    { dataIndex: "name", title: "Name" },
    { dataIndex: "trunc", title: "Key" },
    {
      dataIndex: "used",
      title: "Last Used",
      render: (used) => (used ? new Date(used).toLocaleString() : "Never"),
    },
    {
      dataIndex: "operation",
      title: "Operation",
      render: (_text, record) => (
        <div>
          <Popconfirm
            title="Are you sure you want to delete this key?"
            onConfirm={() => deleteApiKey(record.trunc)}
          >
            <a>Delete</a>
          </Popconfirm>
          <a
            onClick={() => {
              // Set the initial form value as the current key name
              form.setFieldsValue({ name: record.name });
              setEditModalVisible(true);
              setEditingKey(record.trunc);
            }}
            style={{ marginLeft: "1em" }}
          >
            Edit
          </a>
        </div>
      ),
    },
  ];

  const handleAdd = () => {
    setAddModalVisible(true);
  };

  const handleModalOK = () => {
    const name = form.getFieldValue("name");
    if (editingKey) {
      editApiKey(editingKey, name);
      setEditModalVisible(false);
      setEditingKey(undefined);
      form.resetFields();
    } else {
      createApiKey(name);
      form.resetFields();
    }
  };

  const handleModalCancel = () => {
    setAddModalVisible(false);
    setEditModalVisible(false);
    setEditingKey(undefined);
    form.resetFields();
  };

  return (
    <>
      {error && (
        <Alert
          message={error}
          type="error"
          closable
          onClose={() => setError(null)}
          style={{ marginBottom: 16 }}
        />
      )}
      {apiKeys.length > 0 && (
        <Table
          style={{ marginBottom: 16 }}
          dataSource={apiKeys}
          columns={columns}
          loading={loading}
          rowKey="trunc"
          pagination={false}
        />
      )}
      <Button onClick={handleAdd}>
        <Icon name="plus-circle" /> Add API key...
      </Button>

      <Modal
        visible={addModalVisible || editModalVisible}
        title={editingKey ? "Edit API Key Name" : "Create a New API Key"}
        okText={editingKey ? "Save" : "Create"}
        cancelText="Cancel"
        onCancel={handleModalCancel}
        onOk={handleModalOK}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: "Please enter a name" }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
