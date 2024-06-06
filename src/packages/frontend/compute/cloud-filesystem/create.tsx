import { Button, Input, InputNumber, Modal, Radio, Spin } from "antd";
import { useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import Color, { randomColor } from "../color";
import Title from "../title";
import type {
  CreateCloudFilesystem,
  Compression,
} from "@cocalc/util/db-schema/cloud-filesystems";
import {
  MIN_BLOCK_SIZE,
  MAX_BLOCK_SIZE,
} from "@cocalc/util/db-schema/cloud-filesystems";
import { DEFAULT_CONFIGURATION } from "@cocalc/util/db-schema/cloud-filesystems";
import { createCloudFilesystem } from "./api";

export default function CreateCloudFilesystem({
  project_id,
  cloudFilesystems,
  refresh,
}) {
  const [creating, setCreating] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [configuration, setConfiguration] = useState<CreateCloudFilesystem>({
    project_id,
    ...DEFAULT_CONFIGURATION,
    mountpoint: generateMountpoint(
      cloudFilesystems,
      DEFAULT_CONFIGURATION.mountpoint,
    ),
    color: randomColor(),
  });

  const create = async () => {
    try {
      setCreating(true);
      const id = await createCloudFilesystem(configuration);
      console.log("created", id);
      setEditing(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      refresh();
      setCreating(false);
    }
  };

  return (
    <div>
      <Button
        size="large"
        disabled={creating || editing}
        onClick={() => {
          setEditing(true);
        }}
        style={{
          marginRight: "5px",
          width: "80%",
          height: "auto",
          whiteSpace: "normal",
          padding: "10px",
          ...(creating
            ? {
                borderColor: "rgb(22, 119, 255)",
                backgroundColor: "rgb(230, 244, 255)",
              }
            : undefined),
        }}
      >
        <Icon
          name="server"
          style={{
            color: "rgb(66, 139, 202)",
            fontSize: "200%",
          }}
        />
        <br />
        Create Cloud Filesystem... {creating ? <Spin /> : null}
      </Button>
      <Modal
        width={"900px"}
        onCancel={() => {
          setEditing(false);
        }}
        open={editing}
        okText="Create Cloud Filesystem"
        onOk={() => {
          create();
        }}
        destroyOnClose
        title={<div style={{ display: "flex" }}>Create Cloud Filesystem</div>}
      >
        <div style={{ marginTop: "15px" }}>
          <div style={{ display: "flex" }}>
            <EditTitle
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
            <SelectColor
              configuration={configuration}
              setConfiguration={setConfiguration}
            />
          </div>
          <Mountpoint
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <Compression
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <BlockSize
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <Lock
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <MountOptions
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <KeydbOptions
            configuration={configuration}
            setConfiguration={setConfiguration}
          />
          <ShowError
            error={error}
            setError={setError}
            style={{ margin: "15px 0" }}
          />
        </div>
      </Modal>
    </div>
  );
}

function EditTitle({ configuration, setConfiguration }) {
  return (
    <Title
      editable
      title={configuration.title}
      onChange={(title) => setConfiguration({ ...configuration, title })}
    />
  );
}

function SelectColor({ configuration, setConfiguration }) {
  return (
    <Color
      editable
      color={configuration.color}
      onChange={(color) => setConfiguration({ ...configuration, color })}
    />
  );
}

function Mountpoint({ configuration, setConfiguration }) {
  return (
    <div>
      Mountpoint
      <br />
      <Input
        value={configuration.mountpoint}
        onChange={(e) => {
          setConfiguration({ ...configuration, mountpoint: e.target.value });
        }}
      />
    </div>
  );
}

function Compression({ configuration, setConfiguration }) {
  return (
    <div>
      Compression. <b>This cannot be changed later.</b>
      <br />
      <Radio.Group
        onChange={(e) =>
          setConfiguration({ ...configuration, compression: e.target.value })
        }
        value={configuration.compression}
      >
        <Radio value={"lz4"}>lz4 (fast)</Radio>
        <Radio value={"zstd"}>zstd (small)</Radio>
        <Radio value={"none"}>none</Radio>
      </Radio.Group>
    </div>
  );
}

function BlockSize({ configuration, setConfiguration }) {
  return (
    <div>
      Block Size (in MB). <b>This cannot be changed later.</b>
      <br />
      <InputNumber
        min={MIN_BLOCK_SIZE}
        max={MAX_BLOCK_SIZE}
        value={configuration.block_size}
        onChange={(block_size) =>
          setConfiguration({ ...configuration, block_size })
        }
      />
    </div>
  );
}

function Lock({ configuration, setConfiguration }) {
  return (
    <div>
      Delete phrase to prevent yourself from accidentally deleting this cloud
      filesystem
      <br />
      <Input
        value={configuration.lock}
        onChange={(e) => {
          setConfiguration({ ...configuration, lock: e.target.value });
        }}
      />
    </div>
  );
}

function MountOptions({ configuration, setConfiguration }) {
  return (
    <div>
      Mount Options
      <br />
      <Input
        value={configuration.mount_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, mount_options: e.target.value });
        }}
      />
    </div>
  );
}

function KeydbOptions({ configuration, setConfiguration }) {
  return (
    <div>
      Keydb Options
      <br />
      <Input
        value={configuration.keydb_options}
        onChange={(e) => {
          setConfiguration({ ...configuration, keydb_options: e.target.value });
        }}
      />
    </div>
  );
}

function generateMountpoint(cloudFilesystems, base): string {
  const mountpoints = new Set(cloudFilesystems.map((x) => x.mountpoint));
  if (!mountpoints.has(base)) {
    return base;
  }
  let i = 1;
  while (true) {
    const mountpoint = `${base}-${i}`;
    if (!mountpoints.has(mountpoint)) {
      return mountpoint;
    }
    i += 1;
  }
}
