/*
A lightweight react code editor component that can be
used in Next.js.

You have to have this line in nextjs's _app.tsx:

import "@uiw/react-textarea-code-editor/dist.css";

And it also has to be somewhere in the frontend code, so
this will work there.

TODO: To make this editable I just used a quick Input component from antd,
which sucks compared to what codemirror provides.  But it's only temporary.
Codemirror is harder due to compat with nextjs and we'll do that later.
*/

import { ElementType, useEffect, useState } from "react";

export default function CodeEditor(props) {
  const [Editor, setEditor] = useState<ElementType | null>(null);

  // We lazy load the Editor because we want to support using this in nextjs.
  useEffect(() => {
    (async () => {
      setEditor((await import("@uiw/react-textarea-code-editor")).default);
    })();
  }, []);

  if (Editor == null) {
    return <div>Loading...</div>;
  }

  return <Editor {...props} />;
}
