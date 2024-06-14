import { Button, Spin, Popconfirm, Switch } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

interface Props {
  cloudFilesystem;
  setShowMount?;
}

export default function MountButton({ cloudFilesystem, setShowMount }: Props) {
  if (cloudFilesystem.deleting) {
    return (
      <Popconfirm
        title={
          <div style={{ maxWidth: "400px" }}>
            The Google Cloud Storage bucket is currently being deleted.
            Depending on how much data you have, this can take a long time. It
            is managed entirely on the backend using the{" "}
            <A href="https://cloud.google.com/storage-transfer-service">
              Storage Transfer Service
            </A>
            , so you do not need to keep your browser open.
          </div>
        }
      >
        <Button
          danger
          style={{
            fontWeight: 600,
            fontSize: "16px",
          }}
          type="text"
        >
          Deleting... <Spin style={{ marginLeft: "15px" }} />
        </Button>
      </Popconfirm>
    );
  }

  //   return (
  //     <Button
  //       style={{
  //         fontWeight: 600,
  //         fontSize: "16px",
  //         color: cloudFilesystem.mount ? "#389E0D" : "#FF4B00",
  //       }}
  //       type="text"
  //       onClick={() => {
  //         setShowMount(true);
  //       }}
  //     >
  //       <Icon
  //         name={cloudFilesystem.mount ? "run" : "stop"}
  //         style={{ marginRight: "5px" }}
  //       />
  //       {cloudFilesystem.mount ? (
  //         <Tooltip
  //           title={`Will attempt to mount at /home/user/${cloudFilesystem.mountpoint} on any running compute server in this project.`}
  //         >
  //           Automount
  //         </Tooltip>
  //       ) : (
  //         "Not Mounted"
  //       )}
  //     </Button>
  //   );
  return (
    <Switch
      disabled={setShowMount == null}
      onClick={() => {
        setShowMount?.(true);
      }}
      checkedChildren={
        <>
          <Icon name="run" /> Automount
        </>
      }
      unCheckedChildren={<>Not Mounted</>}
      checked={cloudFilesystem.mount}
    />
  );
}
