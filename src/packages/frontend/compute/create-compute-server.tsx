import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { createServer } from "./api";
import { useState } from "react";
import { availableClouds } from "./config";
import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";

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
          const cloud = clouds[0];
          const configuration = CLOUDS_BY_NAME[cloud].defaultConfiguration;
          await createServer({ project_id, cloud, configuration });
        } finally {
          setCreating(false);
        }
      }}
    >
      <Icon name="server" /> New Compute Server... {creating ? <Spin /> : null}
    </Button>
  );
}
