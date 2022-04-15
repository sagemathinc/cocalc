import { useEffect, useState } from "react";
import mermaid from "mermaid";
import { uuid } from "@cocalc/util/misc";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

mermaid.initialize({ startOnLoad: false } as any);

export default function Mermaid({ element }) {
  const isMountedRef = useIsMountedRef();
  const [html, setHtml] = useState<string>("rendering...");
  useEffect(() => {
    if (!element.value?.trim()) {
      setHtml("");
      return;
    }
    const id = "tmp" + uuid().replace(/-/g, "");
    console.log("id = ", id);
    const tmp = $(`<div id=${id}></div>`);
    try {
      mermaid.mermaidAPI.render(id, element.value, (html) => {
        tmp.remove();
        if (isMountedRef.current) {
          setHtml(html);
        }
      });
    } catch (err) {
      tmp.remove();
      setHtml(`${err}`);
    }
  }, [element.value]);
  return <div dangerouslySetInnerHTML={{ __html: html }}></div>;
}
