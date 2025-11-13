/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { join } from "path";
import React, { useRef, useState } from "react";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { Customize, DEFAULT_CUSTOMIZE } from "./consts";

async function _loadCustomize(): Promise<Customize | undefined> {
  // check for a custom logo
  const customizeData = await fetch(join(appBasePath, "customize"));
  return (await customizeData.json())?.configuration;
}

const promise = _loadCustomize();

// load the data only once
async function loadCustomize() {
  return promise;
}

export default function useCustomize() {
  const isMountedRef = useRef<boolean>(true);
  const [customize, setCustomize] = useState<Customize>(DEFAULT_CUSTOMIZE);
  React.useEffect(() => {
    // The hook business below loads the custom logo via the customize
    // JSON endpoint, then updates the component and displays the
    // logo if still mounted.  We have to wrap the async calls in
    // an async function, since useEffect has to return a normal function.
    (async () => {
      try {
        const customize = await loadCustomize();
        if (customize && isMountedRef.current) {
          setCustomize(customize);
        }
      } catch (err) {
        console.log("WARNING: problem loading customize data", err);
      }
    })();
    return () => {
      // component unmounted, so don't bother setting the logo.
      isMountedRef.current = false;
    };
  }, []);

  return customize;
}
