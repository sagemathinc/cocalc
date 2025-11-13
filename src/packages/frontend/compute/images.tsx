import { Spin } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export function RenderImage({
  configuration,
  style,
  IMAGES,
}: {
  configuration: { image: string };
  style?;
  IMAGES;
}) {
  if (IMAGES == null) {
    return <Spin />;
  }
  const { image } = configuration ?? {};
  if (image == null) return null;
  const data = IMAGES[image];
  if (data == null) {
    return <span style={style}>{image}</span>;
  }
  return (
    <span style={style}>
      <Icon name={data.icon} style={{ marginRight: "5px" }} /> {data.label}
    </span>
  );
}
