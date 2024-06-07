import { Card } from "antd";
import { useState } from "react";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";
import CloudFilesystemAvatar from "./avatar";
import CloudFilesystemTitle from "./title";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  cloudFilesystem: CloudFilesystemType;
  style?;
}

export default function CloudFilesystem({ style, cloudFilesystem }: Props) {
  const [error, setError] = useState<string>("");
  const { color, deleting } = cloudFilesystem;
  return (
    <Card
      style={{
        opacity: deleting ? 0.5 : undefined,
        width: "100%",
        minWidth: "500px",
        border: `0.5px solid ${color ?? "#f0f0f0"}`,
        borderRight: `10px solid ${color ?? "#aaa"}`,
        borderLeft: `10px solid ${color ?? "#aaa"}`,
        ...style,
      }}
    >
      <Card.Meta
        avatar={<CloudFilesystemAvatar cloudFilesystem={cloudFilesystem} />}
        title={
          <CloudFilesystemTitle
            cloudFilesystem={cloudFilesystem}
            setError={setError}
          />
        }
        description={
          <>
            <ShowError setError={setError} error={error} />
            {JSON.stringify(cloudFilesystem, undefined, 2)}
          </>
        }
      />
    </Card>
  );
}
