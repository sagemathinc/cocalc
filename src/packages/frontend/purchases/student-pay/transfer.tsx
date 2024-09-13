import { Button, Spin } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  project_id: string;
}

export default function Transfer({ project_id }: Props) {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  return (
    <div>
      <Button disabled={loading}>
        <Icon name="sync" /> Transfer License...
        {loading && <Spin />}
      </Button>
      <ShowError error={error} setError={setError} />
    </div>
  );
}
