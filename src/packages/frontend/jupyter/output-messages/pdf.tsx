/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { OUT_STYLE } from "./style";
import useBlob from "./use-blob";
import { Spin } from "antd";
import ShowError from "@cocalc/frontend/components/error";
import { useState } from "react";
import StableUnsafeHtml from "./stable-unsafe-html";

interface PDFProps {
  value: string | Map<string, any>;
  actions?;
  id?: string;
}

export function PDF({ id, value, actions }: PDFProps) {
  if (typeof value == "string") {
    return <PDFasBlob actions={actions} sha1={value} id={id} />;
  } else {
    return (
      <PDFViewer
        src={`data:application/pdf;base64,${value.get("value")}`}
        id={id}
      />
    );
  }
}

function PDFViewer({ src, id }) {
  // I would prefer to use pdf.js instead of StableUnsafeHtml but that's just way more time...
  // Can't just use <embed... since in a multipage document if you scroll the position is reset
  // when you scroll the notebook.
  return (
    <div style={OUT_STYLE}>
      {id && (
        <StableUnsafeHtml
          html={`<embed style="width:100%;height:70vh" src="${src}" type="application/pdf"/>`}
          docId={id}
        />
      )}
      {!id && (
        <embed
          style={{ width: "100%", height: "70vh" }}
          src={src}
          type="application/pdf"
        />
      )}
    </div>
  );
}

function PDFasBlob({ actions, sha1, id }) {
  const [error, setError] = useState<string>("");
  const src = useBlob({ sha1, actions, type: "application/pdf", setError });

  if (error) {
    return (
      <ShowError
        error={error}
        setError={setError}
        style={{ margin: "5px 0" }}
      />
    );
  }

  if (!src) {
    return <Spin delay={1000} />;
  } else {
    return <PDFViewer src={src} id={id} />;
  }
}
