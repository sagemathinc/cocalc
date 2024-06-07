import MountButton from "./mount-button";
import Title from "../title";
import Menu from "./menu";

interface Props {
  cloudFilesystem;
  setError;
  refresh?;
}

export default function CloudFilesystemTitle({
  cloudFilesystem,
  setError,
  refresh,
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
          setError={setError}
          refresh={refresh}
        />
      </div>
      <Title
        title={cloudFilesystem.title}
        editable={false}
        style={{
          textOverflow: "ellipsis",
          overflow: "hidden",
          flex: 1,
        }}
      />
      <Menu
        cloudFilesystem={cloudFilesystem}
        setError={setError}
        refresh={refresh}
      />
    </div>
  );
}
