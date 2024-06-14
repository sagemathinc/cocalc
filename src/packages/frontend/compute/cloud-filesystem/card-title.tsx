import MountButton from "./mount-button";
import Title from "../title";
import Menu from "./menu";
import { trunc_middle } from "@cocalc/util/misc";

interface Props {
  cloudFilesystem;
  setError;
  refresh?;
  show?;
}

export default function CloudFilesystemCardTitle({
  cloudFilesystem,
  setError,
  show,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        color: "#666",
        borderBottom: `1px solid ${cloudFilesystem.color}`,
        paddingBottom: "5px",
      }}
    >
      <div style={{ flex: 1 }}>
        <MountButton
          cloudFilesystem={cloudFilesystem}
          setShowMount={show?.setShowMount}
        />
      </div>
      <div
        style={{
          flex: 1,
          textOverflow: "ellipsis",
          overflow: "hidden",
          padding: "5px 5px 0 5px",
          fontWeight: 400,
        }}
      >
        <code
          onClick={
            cloudFilesystem.mount
              ? undefined
              : () => show?.setShowEditMountpoint(true)
          }
          style={cloudFilesystem.mount ? {} : { cursor: "pointer" }}
        >
          {trunc_middle(`~/${cloudFilesystem.mountpoint}`, 40)}
        </code>
      </div>
      <div
        style={{ flex: 1, cursor: "pointer", overflow: "hidden" }}
        onClick={() => show?.setShowEditTitleAndColor(true)}
      >
        <Title
          title={cloudFilesystem.title}
          editable={false}
          style={{
            textOverflow: "ellipsis",
            overflow: "hidden",
            padding: "5px 5px 0 5px",
          }}
        />
      </div>
      <Menu cloudFilesystem={cloudFilesystem} setError={setError} show={show} />
    </div>
  );
}
