import { redux } from "@cocalc/frontend/app-framework";
import { Button, Input, Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";

export default function CreateProject({ onCreate }) {
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string>("");

  const handleCreate = async () => {
    const actions = redux.getActions("projects");
    try {
      onCreate(await actions.create_project({ title }));
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <div style={{ padding: "30px 5px", textAlign: "center" }}>
      <Space.Compact style={{ width: "100%", maxWidth: "700px" }}>
        <Input
          placeholder="Project Title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={handleCreate}
        />
        <Button type="primary" onClick={handleCreate}>
          <Icon name="plus-circle-o" /> Create Project
        </Button>
      </Space.Compact>
      <ShowError error={error} setError={setError} style={{ margin: "30px" }} />
    </div>
  );
}
