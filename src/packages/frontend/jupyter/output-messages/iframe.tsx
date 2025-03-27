/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Handle iframe output messages involving a src doc.
*/

import { Spin } from "antd";
import { delay } from "awaiting";
import { useEffect, useRef, useState } from "react";
import useBlob from "./use-blob";
import ReactDOM from "react-dom";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import HTML from "./mime-types/html";
import ShowError from "@cocalc/frontend/components/error";
// This impact loading the iframe data from the backend project (via the sha1 hash).
// Doing retries is useful, e.g., since the project might not be running.
const MAX_ATTEMPTS = 10;
const MAX_WAIT = 5000;
const BACKOFF = 1.3;

const HEIGHT = "70vh";
const WIDTH = "70vw";

interface Props {
  sha1: string;
  actions?;
  cacheId?: string;
  index?: number;
  trust?: boolean;
}

export default function IFrame(props: Props) {
  const [error, setError] = useState<string>("");
  const src = useBlob({
    sha1: props.sha1,
    actions: props.actions,
    type: "text/html",
    setError,
  });

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
    return (
      <div {...props}>
        <Spin delay={1000} />
      </div>
    );
  }

  if (props.cacheId == null || !props.trust) {
    return <NonCachedIFrame src={src} />;
  } else {
    // we only use cached iframe if the iframecontext is setup, e.g., it is in
    // Jupyter notebooks, but not in whiteboards.
    return (
      <HTML
        id={props.cacheId}
        index={props.index}
        trust={props.trust}
        value={`<iframe src="${src}" style="border:0;height:${HEIGHT};width:${WIDTH}"/>`}
      />
    );
  }
}

function NonCachedIFrame({ src }) {
  const { val: attempts, inc: incAttempts } = useCounter();
  const [failed, setFailed] = useState<boolean>(false);
  const delayRef = useRef<number>(500);
  const isMountedRef = useIsMountedRef();
  const iframeRef = useRef(null);

  useEffect(() => {
    const elt: any = ReactDOM.findDOMNode(iframeRef.current);
    if (elt == null) return;
    elt.onload = function () {
      elt.style.height = elt.contentWindow.document.body.scrollHeight + "px";
    };
  }, []);

  async function load_error(): Promise<void> {
    if (attempts >= MAX_ATTEMPTS) {
      setFailed(true);
      return;
    }
    await delay(delayRef.current);
    if (!isMountedRef.current) return;
    delayRef.current = Math.max(MAX_WAIT, delayRef.current * BACKOFF);
    incAttempts();
  }

  if (failed) {
    return <div>Failed to load iframe contents</div>;
  }

  return (
    <iframe
      src={src}
      ref={iframeRef}
      onError={load_error}
      style={{ border: 0, width: WIDTH, minHeight: HEIGHT }}
    />
  );
}
