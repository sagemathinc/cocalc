import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";

interface Props {
  element: Element;
}

export default function HiddenElement({ element }: Props) {
  return (
    <Icon
      name={"eye-slash"}
      style={{ fontSize: element.w - 2, color: "#666" }}
    />
  );
}
