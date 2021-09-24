interface Props {
  project_id: string;
  path: string;
  name?: string;
}

export default function ConfigureName({ project_id, path, name } : Props) {
  return (
    <div style={{ margin: "15px 0" }}>
      <h4>Name</h4>
      {project_id}
      {path}
      Name: {name ?? ""}
    </div>
  );
}
