import { Icon } from "@cocalc/frontend/components/icon";

export default function MountState({ cloudFilesystem }) {
  const { mount } = cloudFilesystem;
  return (
    <div style={{ width: "64px" }}>
      <Icon
        name={mount ? "play" : "stop"}
        style={{ fontSize: "25px", color: mount ? "green" : "red" }}
      />
    </div>
  );
}
