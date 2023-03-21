/*
Show a progress bar based entirely on an estimate for how long something will
take.
*/
import { CSSProperties, useEffect, useState } from "react";
import { Progress } from "antd";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

interface Props {
  seconds: number;
  style?: CSSProperties;
}

export default function ProgressEstimate({ seconds, style }: Props) {
  const isMountedRef = useIsMountedRef();
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isMountedRef.current) {
        return;
      }
      const newProgress = Math.min(progress + 0.1, seconds);
      setProgress(newProgress);
      if (newProgress === seconds) {
        setDone(true);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [progress, seconds]);

  return (
    <Progress
      style={style}
      percent={Math.round((progress / seconds) * 100)}
      status={done ? "success" : "active"}
      showInfo={false}
    />
  );
}
