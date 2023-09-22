import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer } from "./api";
import { useState } from "react";
import { availableClouds } from "./config";

export default function CreateComputeServer({ project_id }) {
  const [creating, setCreating] = useState<boolean>(false);
  return (
    <Button
      size="large"
      disabled={creating}
      onClick={async () => {
        try {
          setCreating(true);
          const clouds = availableClouds();
          await createServer({ project_id, cloud: clouds[0] });
        } finally {
          setCreating(false);
        }
      }}
    >
      <Icon name="server" /> Create Compute Server...{" "}
      {creating ? <Spin /> : null}
    </Button>
  );
}
