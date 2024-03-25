import { Button, List, Modal, Skeleton } from "antd";

import { useEffect, useState } from "@cocalc/frontend/app-framework";
import { HelpIcon, Icon, Title } from "@cocalc/frontend/components";
import OllamaAvatar from "@cocalc/frontend/components/ollama-avatar";
import { ClientLLM } from "@cocalc/util/db-schema/llm-utils";

interface Props {
  on_change: (name: string, value: any) => void;
}

export function CustomLLM(props: Readonly<Props>) {
  const { on_change } = props;

  console.log({ on_change });

  const [editModel, setEditModel] = useState<ClientLLM | null>(null);
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ClientLLM[]>([]);

  useEffect(() => {
    setLoading(true);
    setModels([
      {
        type: "ollama",
        display: "Model 1",
        model: "model1",
        endpoint: "https://test.com/api",
      },
      {
        type: "ollama",
        display: "Model 2",
        model: "model2",
        endpoint: "https://test.com/api",
      },
    ]);
    setLoading(false);
  }, []);

  function addModel() {
    return (
      <Button
        block
        onClick={() =>
          setEditModel({ type: "ollama", display: "", endpoint: "", model: "" })
        }
      >
        Add Model
      </Button>
    );
  }

  function renderList() {
    return (
      <List
        loading={loading}
        itemLayout="horizontal"
        dataSource={models}
        renderItem={(item: ClientLLM) => {
          const { display, model } = item;

          return (
            <List.Item
              actions={[
                <Button
                  icon={<Icon name="pen" />}
                  type="link"
                  onClick={() => setEditModel(item)}
                >
                  Edit
                </Button>,
                <Button
                  icon={<Icon name="trash" />}
                  type="link"
                  danger
                  onClick={() => window.alert(`delete ${model}`)}
                >
                  Delete
                </Button>,
              ]}
            >
              <Skeleton avatar title={false} loading={false} active>
                <List.Item.Meta
                  avatar={<OllamaAvatar size={22} />}
                  title={display}
                />
                <div>content</div>
              </Skeleton>
            </List.Item>
          );
        }}
      />
    );
  }

  function renderForm() {
    return (
      <Modal
        open={editModel != null}
        title="Add/Edit Custom LLM"
        onOk={() => setEditModel(null)}
        onCancel={() => setEditModel(null)}
      >
        <p>Some contents...</p>
        <p>{JSON.stringify(editModel)}</p>
      </Modal>
    );
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
      {addModel()}
    </>
  );
}
