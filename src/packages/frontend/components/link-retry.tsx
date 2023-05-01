/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "antd";

import {
  useEffect,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, Space } from "@cocalc/frontend/components";
import { open_new_tab } from "@cocalc/frontend/misc";
import { retry_until_success } from "@cocalc/util/async-utils";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  href: string;
  mode?: "link" | "button";
  children?;
  size?: "small" | undefined; // antd button size
  loadingText?: string;
  onClick?: () => void;
}

const LinkRetry: React.FC<Props> = (props: Props) => {
  const { href, size, mode = "link", children, onClick } = props;
  const isMountedRef = useIsMountedRef();
  const [working, setWorking] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<boolean>(false);

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
    onClick?.();
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
    //console.log("click , state = ", { error, working, loading });
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
              <Space /> <Loading text={props.loadingText} />
            </span>
          )}
          {error && (
            <>
              <span style={{ color: COLORS.ANTD_RED_WARN }}>
                <Space /> (failed to load)
              </span>
            </>
          )}
        </span>
      );
    case "button":
      return (
        <Button onClick={click} size={size}>
          {children}
          {loading ? (
            <Icon name="cocalc-ring" spin />
          ) : (
            error && (
              <span style={{ color: COLORS.ANTD_RED_WARN }}>
                (failed to load)
              </span>
            )
          )}
        </Button>
      );
    default:
      throw Error("invalid mode");
  }
};

export default LinkRetry;
