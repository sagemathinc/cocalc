import { join } from "path";
import { useEffect, useRef, useState } from "react";

import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

// subset of CustomizeState
interface Customize {
  logo_rectangular: string;
  logo_square: string;
}

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
  const [customize, setCustomize] = useState<Customize>({
    logo_rectangular: "",
    logo_square: join(appBasePath, "webapp/favicon.ico"),
  });
  useEffect(() => {
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
