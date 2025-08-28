/*
Show a progress bar based entirely on an estimate for how long something will
take.
*/
import { CSSProperties, useEffect, useState } from "react";
import { Progress } from "antd";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import useDelayedRender from "@cocalc/frontend/app-framework/delayed-render-hook";

interface Props {
  seconds: number;
  style?: CSSProperties;
  delay?: number;
}

export default function ProgressEstimate({ seconds, style, delay }: Props) {
  const isMountedRef = useIsMountedRef();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }
      const newProgress = Math.min(progress + 0.05, seconds);
      setProgress(newProgress);
    }, 50);
    return () => clearInterval(interval);
  }, [progress, seconds]);

  if (!useDelayedRender(delay ?? 0)) {
    return null;
  }

  return (
    <Progress
      style={style}
      percent={Math.round((progress / seconds) * 100)}
      status={"active"}
      showInfo={false}
    />
  );
}
