import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";
import { getStyle } from "./text-static";

interface Props {
  element: Element;
}

export default function IconElt({ element }: Props) {
  return (
    <Icon
      name={element.data?.icon ?? "square"}
      style={getStyle(element, { background: "white" })}
    />
  );
}
