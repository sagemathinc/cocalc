import PublicTemplates from "@cocalc/frontend/compute/public-templates";
import { Button } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";

export default function ComputeServerTemplates({ style }: { style? }) {
  const [id, setId] = useState<number | null>(null);
  return (
    <div>
      <PublicTemplates style={style} setId={setId} />
      {id != null && (
        <Button
          size="large"
          type="primary"
          onClick={() => {
            console.log("make compute server from template", { id });
          }}
        >
          <Icon name="server" /> Create Compute Server...
        </Button>
      )}
    </div>
  );
}
