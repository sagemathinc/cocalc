import { Button, Input, Modal, Spin } from "antd";
import { useState } from "react";

import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import { CancelText } from "@cocalc/frontend/i18n/components";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";
import Color from "../color";
import { editCloudFilesystem } from "./api";
import { editModalStyle } from "./util";

interface Props {
  cloudFilesystem: CloudFilesystem;
  open?: boolean;
  setOpen;
  refresh;
}

// Edit the title and color of a cloud file system
export default function EditTitleAndColor({
  cloudFilesystem,
  open,
  setOpen,
  refresh,
}: Props) {
  const [changing, setChanging] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [title, setTitle] = useState<string>(
    cloudFilesystem.title ?? "Untitled",
  );
  const [color, setColor] = useState<string>(cloudFilesystem.color ?? "#666");

  const doEdit = async () => {
    if (cloudFilesystem.title == title && cloudFilesystem.color == color) {
      // no op
      setOpen(false);
      return;
    }
    try {
      setChanging(true);
      await editCloudFilesystem({
        id: cloudFilesystem.id,
        title,
        color,
      });
      refresh();
      setOpen(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <Modal
      styles={{ body: editModalStyle(cloudFilesystem) }}
      centered
      title={
        <>
          <Icon name={"colors"} /> Edit Title and Color
        </>
      }
      open={open}
      onCancel={() => setOpen(false)}
      footer={[
        <Button key="cancel" onClick={() => setOpen(false)}>
          <CancelText />
        </Button>,
        <Button
          key="ok"
          type="primary"
          disabled={
            changing ||
            (cloudFilesystem.title == title && cloudFilesystem.color == color)
          }
          onClick={doEdit}
        >
          Change Title and Color{" "}
          {changing ? <Spin style={{ marginLeft: "15px" }} /> : undefined}
        </Button>,
      ]}
    >
      <Input
        onPressEnter={doEdit}
        style={{ width: "100%", margin: "10px 0" }}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Color editable color={color} onChange={setColor} />
      <ShowError error={error} setError={setError} />
    </Modal>
  );
}
