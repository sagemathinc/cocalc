import { useState } from "react";
import { Button } from "antd";
import useCustomize from "lib/use-customize";
import editURL from "lib/share/edit-url";
// import ExternalLink from "./external-link";
// href={editURL({ id, path, dns })}

interface Props {
  id: string;
  path: string;
}

export default function Edit({ id, path }: Props) {
  const { dns } = useCustomize();
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <div>
      <Button
        onClick={(e) => {
          e.preventDefault();
          setExpanded(!expanded);
        }}
        key="edit"
      >
        Edit...
      </Button>
      {expanded && <EditOptions id={id} path={path} />}
    </div>
  );
}

function EditOptions({ id, path }: Props) {
  return <div>Options...</div>;
}
