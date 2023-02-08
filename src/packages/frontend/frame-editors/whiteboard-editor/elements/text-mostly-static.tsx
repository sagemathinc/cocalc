// See comment in note-mostly-static for why this exists.

import { Element } from "../types";
import { getFullStyle, PLACEHOLDER } from "./text-static";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { useFrameContext } from "../hooks";

interface Props {
  element: Element;
  readOnly?: boolean;
}

export default function Text({ element, readOnly }: Props) {
  const { actions } = useFrameContext();
  const isEmpty = !element.str?.trim();
  return (
    <MostlyStaticMarkdown
      value={isEmpty ? PLACEHOLDER : element.str ?? ""}
      style={getFullStyle(element, isEmpty)}
      onChange={
        readOnly || actions == null
          ? undefined
          : (str) => {
              actions.setElement({
                obj: { id: element.id, str },
                commit: true,
              });
            }
      }
    />
  );
}
