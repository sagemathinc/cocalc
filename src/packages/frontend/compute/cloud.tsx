import {
  CLOUDS_BY_NAME,
  Cloud as CloudType,
} from "@cocalc/util/db-schema/compute-servers";
import { Button, Select, Space, Spin } from "antd";
import { useEffect, useState } from "react";
import { setServerCloud } from "./api";

interface Props {
  cloud;
  editable?: boolean;
  height?: number | string;
  setError?;
  id?: number;
}

export default function Cloud({
  cloud,
  editable,
  height,
  setError,
  id,
}: Props) {
  const [newCloud, setNewCloud] = useState<CloudType>(cloud);
  const [saving, setSaving] = useState<boolean>(false);
  const [edit, setEdit] = useState<boolean>(false);
  useEffect(() => {
    setNewCloud(cloud);
  }, [cloud]);

  const x = CLOUDS_BY_NAME[cloud];
  const label = (
    <span>
      {x?.image ? (
        <img src={x.image} height={height ?? 18} />
      ) : (
        x?.label ?? "No Cloud Configured"
      )}
    </span>
  );
  if (!editable || !id) {
    return label;
  }

  const options: { value: string; label: JSX.Element }[] = [];
  for (const cloud in CLOUDS_BY_NAME) {
    options.push({
      value: cloud,
      label: <Cloud editable={false} cloud={cloud} />,
    });
  }

  if (!edit) {
    return (
      <div style={{ cursor: "pointer" }} onClick={() => setEdit(true)}>
        {label}
      </div>
    );
  }

  return (
    <Space>
      <Select
        defaultValue={cloud}
        style={{ width: 180 }}
        onChange={setNewCloud}
        options={options}
      />
      <>
        <Button
          onClick={() => {
            setNewCloud(cloud);
            setEdit(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type={"primary"}
          disabled={saving || cloud == newCloud}
          onClick={async () => {
            if (edit) {
              if (cloud == newCloud) return;
              // save to backend
              try {
                setSaving(true);
                await setServerCloud({ cloud: newCloud, id });
              } catch (err) {
                setError(`${err}`);
              } finally {
                setSaving(false);
              }
            }
            setEdit(false);
          }}
        >
          Save
          {saving && <Spin />}
        </Button>
      </>
    </Space>
  );
}
