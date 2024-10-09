/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Tooltip } from "antd";

import {
  useEffect,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { Gap, Icon, Loading } from "@cocalc/frontend/components";
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
  autoStart?: boolean;
  maxTime?: number;
  tooltip?: React.ReactNode;
}

const LinkRetry: React.FC<Props> = ({
  href,
  size,
  mode = "link",
  children,
  onClick,
  autoStart,
  maxTime = 30000,
  loadingText,
  tooltip,
}: Props) => {
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
        max_time: maxTime,
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

  useEffect(() => {
    if (autoStart) {
      start();
    }
  }, [href]);

  function renderError() {
    if (!error) return;
    return (
      <span style={{ color: COLORS.ANTD_RED_WARN }}>
        <Gap /> (failed to load)
      </span>
    );
  }

  switch (mode) {
    case "button":
      const btn = (
        <Button onClick={click} size={size}>
          {children}
          {loading ? <Icon name="cocalc-ring" spin /> : renderError()}
        </Button>
      );
      if (tooltip) {
        return <Tooltip title={tooltip}>{btn}</Tooltip>;
      } else {
        return btn;
      }
    case "link":
      const aLink = (
        <a onClick={click} style={{ cursor: "pointer" }}>
          {children}
        </a>
      );
      const a = tooltip ? <Tooltip title={tooltip}>{aLink}</Tooltip> : aLink;
      return (
        <span>
          {a}
          {mode === "link" && loading && (
            <span>
              <Gap /> <Loading text={loadingText} />
            </span>
          )}
          {renderError()}
        </span>
      );
    default:
      console.warn(`LinkRetry: invalid mode "${mode}"`);
  }
};

export default LinkRetry;
