import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer } from "./api";
import { useState } from "react";

export default function CreateComputeServer({ project_id }) {
  const [creating, setCreating] = useState<boolean>(false);
  return (
    <Button
      size="large"
      disabled={creating}
      onClick={async () => {
        try {
          setCreating(true);
          await createServer({ project_id });
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
