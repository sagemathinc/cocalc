/*
React component for managing a list of api keys.

Applications:

 - the keys for a project
 - the keys for an account
*/

import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Table,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import TimeAgo from "react-timeago"; // so can use from nextjs

import type { ApiKey } from "@cocalc/util/db-schema/api-keys";
import { ColumnsType } from "antd/es/table";
import { A } from "./A";
import CopyToClipBoard from "./copy-to-clipboard";
import { Icon } from "./icon";
const { useForm } = Form;

interface Props {
  // Manage is a function that lets you get all api keys, delete a single api key,
  // or create an api key.
  // - If you call manage with input "get" it will return a Javascript array ApiKey[]
  //   of all your api keys, with each api key represented as an object {name, id, trunc, last_active?}
  //   as defined above.  The actual key itself is not returned, and trunc is a truncated
  //   version of the key used for display.
  // - If you call manage with input "delete" and id set then that key will get deleted.
  // - If you call manage with input "create", then a new api key is created and returned
  //   as a single string. This is the one and only time the user can see this *secret*.
  // - If call with edit and both name and id set, changes the key determined by id
  //   to have the given name. Similar for expire.
  manage: (opts: {
    action: "get" | "delete" | "create" | "edit";
    id?: number;
    name?: string;
    expire?: Date;
  }) => Promise<ApiKey[] | undefined>;
}

export default function ApiKeys({ manage }: Props) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingKey, setEditingKey] = useState<number | undefined>(undefined);
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
      setApiKeys(response as ApiKey[]);
      setLoading(false);
      setError(null);
    } catch (err) {
      setLoading(false);
      setError(err.message || "An error occurred");
    }
  };

  const deleteApiKey = async (id: number) => {
    try {
      await manage({ action: "delete", id });
      getAllApiKeys();
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const deleteAllApiKeys = async () => {
    for (const { id } of apiKeys) {
      await deleteApiKey(id);
    }
  };

  const editApiKey = async (id: number, name: string, expire?: Date) => {
    try {
      await manage({ action: "edit", id, name, expire });
      getAllApiKeys();
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const createApiKey = async (name: string, expire?: Date) => {
    try {
      const response = await manage({
        action: "create",
        name,
        expire,
      });
      setAddModalVisible(false);
      getAllApiKeys();

      Modal.success({
        title: "New Secret API Key",
        content: (
          <>
            <div>
              Save this secret key somewhere safe. You won't be able to view it
              again here. If you lose this secret key, you'll need to generate a
              new one.
            </div>
            <div style={{ marginTop: 16 }}>
              <strong>Secret API Key</strong>{" "}
              <CopyToClipBoard
                style={{ marginTop: "16px" }}
                value={response?.[0].secret ?? "failed to get secret"}
              />
            </div>
          </>
        ),
      });
      setError(null);
    } catch (err) {
      setError(err.message || "An error occurred");
    }
  };

  const columns: ColumnsType<ApiKey> = [
    { dataIndex: "name", title: "Name" },
    { dataIndex: "id", title: "Id" },
    { dataIndex: "trunc", title: "Key" },
    {
      dataIndex: "last_active",
      title: "Last Used",
      render: (last_active) =>
        last_active ? <TimeAgo date={last_active} /> : "Never",
    },
    {
      dataIndex: "expire",
      title: "Expire",
      render: (expire) => (expire ? <TimeAgo date={expire} /> : "Never"),
    },
    {
      dataIndex: "operation",
      title: "Operation",
      render: (_text, record) => (
        <div>
          <Popconfirm
            title="Are you sure you want to delete this key?"
            onConfirm={() => deleteApiKey(record.id)}
          >
            <a>Delete</a>
          </Popconfirm>
          <a
            onClick={() => {
              // Set the initial form value as the current key name
              form.setFieldsValue({ name: record.name });
              setEditModalVisible(true);
              setEditingKey(record.id);
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
    const expire = form.getFieldValue("expire");
    if (editingKey != null) {
      editApiKey(editingKey, name, expire);
      setEditModalVisible(false);
      setEditingKey(undefined);
      form.resetFields();
    } else {
      createApiKey(name, expire);
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
          rowKey="id"
          pagination={false}
        />
      )}
      <Button.Group>
        <Button onClick={handleAdd}>
          <Icon name="plus-circle" /> Add API key...
        </Button>
        <Button onClick={getAllApiKeys}>Refresh</Button>
        {apiKeys.length > 0 && (
          <Popconfirm
            title="Are you sure you want to delete all these api keys?"
            onConfirm={deleteAllApiKeys}
          >
            <Button danger>Delete All...</Button>
          </Popconfirm>
        )}
      </Button.Group>
      <p style={{ marginTop: "10px" }}>
        Read the <A href="https://doc.cocalc.com/api/">API documentation</A>.
      </p>
      <Modal
        open={addModalVisible || editModalVisible}
        title={
          editingKey != null ? "Edit API Key Name" : "Create a New API Key"
        }
        okText={editingKey != null ? "Save" : "Create"}
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
          <Form.Item
            name="expire"
            label="Expire"
            rules={[
              {
                required: false,
                message: "Optional date when key will be automatically deleted",
              },
            ]}
          >
            <DatePicker
              showTime
              disabledDate={(current) => {
                // disable all dates before today
                return current && current < dayjs();
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
