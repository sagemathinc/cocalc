import { useEffect, useState } from "react";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { Progress } from "antd";
import { delay } from "awaiting";

const DELAY = 2;

export default function FakeProgress({ time }) {
  const [percent, setPercent] = useState<number>(0);
  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    (async () => {
      let t0 = 0;
      while (t0 <= time) {
        await delay(DELAY);
        if (!isMountedRef.current) return;
        t0 += DELAY;
        setPercent(Math.round((t0 * 100) / time));
      }
    })();
  }, []);

  return (
    <Progress
      type="circle"
      format={() => null}
      percent={percent}
      strokeColor={{ "0%": "#108ee9", "100%": "#87d068" }}
    />
  );
}
