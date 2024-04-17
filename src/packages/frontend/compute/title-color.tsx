import { Modal } from "antd";
import { useState } from "react";
import Title from "./title";
import Color from "./color";
import ShowError from "@cocalc/frontend/components/error";
import { useServer } from "./compute-server";

function TitleColor({ id, project_id, onPressEnter }) {
  const server = useServer({ id, project_id });
  const [error, setError] = useState<string>("");
  const { title, color } = server ?? {};

  return (
    <div
      style={{
        marginTop: "15px",
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
      }}
    >
      <Title
        title={title}
        id={id}
        editable
        setError={setError}
        onPressEnter={onPressEnter}
      />
      <Color
        color={color}
        id={id}
        editable
        setError={setError}
        style={{
          marginLeft: "10px",
        }}
      />
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "15px 0", width: "100%" }}
      />
    </div>
  );
}

export function TitleColorModal({ id, project_id, close }) {
  return (
    <Modal
      open
      onCancel={close}
      onOk={close}
      title={"Edit the Title and Color"}
      cancelButtonProps={{ style: { display: "none" } }}
    >
      <TitleColor id={id} project_id={project_id} onPressEnter={close} />
    </Modal>
  );
}
