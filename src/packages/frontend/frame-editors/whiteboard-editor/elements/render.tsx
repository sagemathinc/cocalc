/*
Render any element
*/

import { Element } from "../types";
import { Markdown } from "@cocalc/frontend/components";

interface Props {
  element: Element;
}

export default function Render({ element }: Props) {
  /* dumb for now, but will be a cool plugin system like we used for our slate wysiwyg editor....*/

  const { str, data, type } = element;

  switch (type) {
    case "markdown":
      return <Markdown value={str} />;
    default:
      return (
        <>
          {str != null && str}
          {data != null && <span>{JSON.stringify(data, undefined, 2)}</span>}
        </>
      );
  }
}
