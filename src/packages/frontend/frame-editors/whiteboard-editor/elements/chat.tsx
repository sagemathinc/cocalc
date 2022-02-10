import { Icon } from "@cocalc/frontend/components/icon";
import { Element } from "../types";
import { getStyle } from "./text";
import { ChatInput } from "@cocalc/frontend/chat/input";

interface Props {
  element: Element;
  focused?: boolean;
}

export default function IconElt({ element, focused }: Props) {
  if (!focused) {
    return (
      <Icon
        name={"comment"}
        style={getStyle(element, { background: "white" })}
      />
    );
  } else {
    return <Conversation element={element} />;
  }
}

function Conversation({ element }: { element: Element }) {
  return (
    <div>
      <pre>{JSON.stringify(element)}</pre>
      <ChatInput />
    </div>
  );
}
