import { Card } from "antd";
import type { CloudFilesystem as CloudFilesystemType } from "@cocalc/util/db-schema/cloud-filesystems";

export default function CloudFilesystem(props: CloudFilesystemType) {
  return <Card>{JSON.stringify(props, undefined, 2)}</Card>;
}
