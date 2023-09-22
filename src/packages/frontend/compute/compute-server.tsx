import { Button, Card, Space, Spin, Table } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { CSSProperties, useState } from "react";
import { CLOUDS_BY_NAME } from "@cocalc/util/db-schema/compute-servers";
import ColorPicker from "@cocalc/frontend/components/color-picker";
import ShowError from "@cocalc/frontend/components/error";
import { setServerColor } from "./api";

interface Props extends ComputeServerUserInfo {
  style?: CSSProperties;
  editable: boolean;
}

export default function ComputeServer({
  id,
  name,
  color,
  state,
  cloud,
  configuration,
  project_id,
  style,
  editable,
}: Props) {
  const [error, setError] = useState<string>("");

  const columns = [
    { dataIndex: "label", key: "label", width: 150 },
    { dataIndex: "value", key: "value" },
  ];

  const data = [
    { label: "State", value: state },
    {
      label: "Cloud",
      value: <Cloud cloud={cloud} id={id} state={state} />,
    },
    {
      label: "Configuration",
      value: JSON.stringify(configuration, undefined, 2),
    },
    {
      label: "Color",
      value: (
        <Color color={color} id={id} editable={editable} setError={setError} />
      ),
    },
    {
      label: "Project",
      value: <ProjectTitle project_id={project_id} />,
    },
  ];
  return (
    <Card
      title={name ?? "Unnamed Compute Server"}
      extra={<>Id: {id}</>}
      style={{
        width: "100%",
        border: `2px solid ${color ?? "#aaa"}`,
        ...style,
      }}
    >
      <ShowError error={error} setError={setError} />
      <Table
        rowKey="label"
        columns={columns}
        dataSource={data}
        pagination={false}
      />
    </Card>
  );
}

function Cloud({ cloud, id, state }) {
  console.log({ id, state });
  const x = CLOUDS_BY_NAME[cloud];
  return (
    <div>
      {x?.image ? (
        <img src={x.image} height={18} />
      ) : (
        x?.label ?? "Select a Cloud"
      )}
    </div>
  );
}

function Color({ color, id, editable, setError }) {
  const [saving, setSaving] = useState<boolean>(false);
  const [edit, setEdit] = useState<boolean>(false);
  const [choice, setChoice] = useState<string>(color);
  return (
    <Space style={{ width: "100%" }}>
      <div
        style={{ width: "100px", height: "18px", background: color ?? "#aaa" }}
      />{" "}
      {editable && (
        <Button
          disabled={saving}
          style={{ float: "right" }}
          onClick={async () => {
            if (edit) {
              if (choice == color) return;
              // save to backend
              try {
                setSaving(true);
                await setServerColor({ color: choice, id });
              } catch (err) {
                setError(`${err}`);
              } finally {
                setSaving(false);
              }
            }
            setEdit(!edit);
          }}
        >
          {edit ? "Save" : "Edit"}
          {saving && <Spin />}
        </Button>
      )}
      {edit && <ColorPicker color={color} onChange={setChoice} />}
    </Space>
  );
}
