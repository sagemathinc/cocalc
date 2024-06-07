import MountButton from "./mount-button";

export default function CloudFilesystemTitle({ cloudFilesystem, setError }) {
  return (
    <div
      style={{
        display: "flex",
        color: "#666",
        borderBottom: `1px solid ${cloudFilesystem.color}`,
        paddingBottom: "5px",
      }}
    >
      <MountButton cloudFilesystem={cloudFilesystem} setError={setError} />
    </div>
  );
}
