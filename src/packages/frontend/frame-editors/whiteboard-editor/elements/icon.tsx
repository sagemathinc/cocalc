import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";
import { getStyle } from "./text";

interface Props {
  element: Element;
}

export default function IconElt({ element }: Props) {
  return (
    <Icon name={element.data?.name ?? "square"} style={getStyle(element)} />
  );
}
