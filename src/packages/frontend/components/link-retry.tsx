/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useIsMountedRef, useState } from "../app-framework";
import { Loading, Space, Icon } from "../components";
import { Button } from "../antd-bootstrap";
import { retry_until_success } from "@cocalc/util/async-utils";
import { open_new_tab } from "../misc";

interface Props {
  href: string;
  mode?: "link" | "button";
  children?;
}

export default function LinkRetryUntilSuccess({ href, mode, children }: Props) {
  const isMountedRef = useIsMountedRef();
  const [working, setWorking] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

  if (mode == null) {
    mode = "link";
  }

  useEffect(() => {
    setError(false);
    setLoading(false);
    setWorking(false);
  }, [href, mode]);

  function open(): void {
    // open_new_tab takes care of blocked popups -- https://github.com/sagemathinc/cocalc/issues/2599
    open_new_tab(href);
  }

  async function start(): Promise<void> {
    setLoading(true);
    setError(false);
    const f = async (): Promise<void> => {
      await $.ajax({
        url: href,
        timeout: 3000,
      });
    };
    try {
      await retry_until_success({
        f,
        max_delay: 500,
        max_time: 30000,
        desc: "opening link",
      });
    } catch (err) {
      if (!isMountedRef.current) {
        return;
      }
      setError(true);
      setLoading(false);
      setWorking(false);
      return;
    }
    // Open even if NOT mounted!  E.g., user clicks link then switches tabs.
    open();
    if (!isMountedRef.current) {
      // not mounted, so don't mess with setState.
      return;
    }
    setError(false);
    setLoading(false);
    setWorking(true);
  }

  function click(): void {
    console.log("click , state = ", { error, working, loading });
    if (working) {
      open();
    } else if (!loading) {
      start();
    }
  }

  switch (mode) {
    case "link":
      return (
        <span>
          <a onClick={click} style={{ cursor: "pointer" }}>
            {children}
          </a>
          {mode === "link" && loading && (
            <span>
              <Space /> <Loading />
            </span>
          )}
          {error && (
            <span style={{ color: "darkred" }}>
              <Space /> (failed to load){" "}
            </span>
          )}
        </span>
      );
    case "button":
      return (
        <Button onClick={click} bsSize={"small"}>
          {children}
          {loading ? (
            <Icon name="cocalc-ring" spin />
          ) : (
            error && <span style={{ color: "darkred" }}>(failed to load)</span>
          )}
        </Button>
      );
    default:
      throw Error("invalid mode");
  }
}
