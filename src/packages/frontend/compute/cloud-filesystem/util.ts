export function editModalStyle(cloudFilesystem) {
  return {
    borderWidth: "0.5px 10px",
    borderStyle: "solid",
    padding: "10px 15px",
    borderRadius: "5px",
    borderColor: cloudFilesystem.color ?? "#666",
  };
}
