/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handle iframe output messages involving a src doc.
*/

import { delay } from "awaiting";
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { get_blob_url } from "../server-urls";

interface Props {
  sha1: string;
  project_id: string;
}

const MAX_ATTEMPTS = 10;
const MAX_WAIT = 5000;
const BACKOFF = 1.3;

export const IFrame: React.FC<Props> = (props: Props) => {
  const { sha1, project_id } = props;

  const { val: attempts, inc: inc_attempts } = useCounter();
  const [failed, set_failed] = useState<boolean>(false);
  const delay_ref = useRef<number>(500);
  const isMountedRef = useIsMountedRef();
  const iframe_ref = useRef(null);

  useEffect(() => {
    const elt: any = ReactDOM.findDOMNode(iframe_ref.current);
    if (elt == null) return;
    elt.onload = function () {
      elt.style.height = elt.contentWindow.document.body.scrollHeight + "px";
    };
  }, []);

  async function load_error(): Promise<void> {
    if (attempts >= MAX_ATTEMPTS) {
      set_failed(true);
      return;
    }
    await delay(delay_ref.current);
    if (!isMountedRef.current) return;
    delay_ref.current = Math.max(MAX_WAIT, delay_ref.current * BACKOFF);
    inc_attempts();
  }

  if (failed) {
    return <div>Failed to load iframe contents</div>;
  }
  return (
    <iframe
      ref={iframe_ref}
      src={get_blob_url(project_id, "html", sha1) + `&attempts=${attempts}`}
      onError={load_error}
      style={{ border: 0, width: "100%", minHeight: "500px" }}
    />
  );
};
