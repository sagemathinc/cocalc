import { Modal } from "antd";
import { Set } from "immutable";
import { plural } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  type: "json" | "csv";
  onCancel: () => void;
  selected: Set<any>;
  data: object[];
}

export default function Export({ type, onCancel, selected, data }: Props) {
  console.log({ type, data });
  return (
    <Modal
      open
      title={
        <>
          <Icon name="file-export" /> Export {selected.size}{" "}
          {plural(selected.size, "record")}{" "}
        </>
      }
      onCancel={onCancel}
    >
      <p>Some contents...</p>
      <p>Some contents...</p>
      <p>Some contents...</p>
    </Modal>
  );
}
