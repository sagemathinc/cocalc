import useAPI from "lib/hooks/api";
import { Alert, Popover } from "antd";
import { ReactNode } from "react";
import Loading from "components/share/loading";

interface Props {
  license_id: string;
  contrib?: { [project_id: string]: object };
}

export default function License({ license_id, contrib }: Props) {
  _ = contrib;
  return (
    <Popover
      content={() => <Details license_id={license_id} />}
      title={license_id}
    >
      <span style={{ fontFace: "monospace" }}>{license_id}</span>
    </Popover>
  );
}

function Details({ license_id }) {
  const { result, error } = useAPI("licenses/get-license", { license_id });
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return <pre>{JSON.stringify(result, undefined, 2)}</pre>;
}
