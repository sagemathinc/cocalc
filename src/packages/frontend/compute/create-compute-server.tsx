import { Button, Card, Divider, Input, Form, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer } from "./api";
import { useEffect, useRef, useState } from "react";
import { availableClouds } from "./config";
import {
  CLOUDS_BY_NAME,
  Cloud as CloudType,
} from "@cocalc/util/db-schema/compute-servers";
import Cloud from "./cloud";
import ShowError from "@cocalc/frontend/components/error";

export default function CreateComputeServer({ project_id }) {
  const [creating, setCreating] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [title, setTitle] = useState<string>(
    `Untitled ${new Date().toISOString().split("T")[0]}`,
  );
  const [error, setError] = useState<string>("");
  const [cloud, setCloud] = useState<CloudType>(availableClouds()[0]);
  const titleRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      return;
    }
    setTimeout(() => (titleRef.current as any)?.input?.select(), 1);
  }, [editing]);

  const handleCreate = async () => {
    try {
      setError("");
      setCreating(true);
      const configuration = CLOUDS_BY_NAME[cloud].defaultConfiguration;
      try {
        await createServer({ project_id, cloud, name: title, configuration });
      } catch (err) {
        setError(`${err}`);
      }
    } finally {
      setCreating(false);
      setEditing(false);
    }
  };

  return (
    <div>
      <Button
        disabled={creating || editing}
        onClick={() => {
          setEditing(true);
        }}
      >
        <Icon name="plus-circle" /> Create New Compute Server...{" "}
        {creating ? <Spin /> : null}
      </Button>
      <ShowError error={error} setError={setError} />
      {editing && (
        <Card
          style={{ margin: "15px 0" }}
          title=<>
            <Icon name="server" /> Create New Compute Server
          </>
        >
          <Form>
            <Form.Item label="Title">
              <Input
                ref={titleRef}
                autoFocus
                style={{ width: "300px" }}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={"Name your new compute server..."}
              />
              <div style={{ color: "#888", marginTop: "5px" }}>
                You can easily change the title at any time later.
              </div>
            </Form.Item>
            <Form.Item label="Cloud">
              <Cloud
                style={{ width: "300px" }}
                editable={true}
                cloud={cloud}
                setCloud={setCloud}
              />
            </Form.Item>
          </Form>
          <Divider />
          <Button onClick={() => setEditing(false)}>Cancel</Button>{" "}
          <Button
            type="primary"
            disabled={!title.trim()}
            onClick={handleCreate}
          >
            Create Compute Server
          </Button>
        </Card>
      )}
    </div>
  );
}
