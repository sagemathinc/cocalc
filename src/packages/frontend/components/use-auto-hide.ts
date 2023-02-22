import { useCallback, useEffect, useRef, useState } from "react";
import { throttle } from "lodash";

const DEFAULT_HIDE_DELAY = 2000;

interface Props {
  enabled?: boolean;
  hideDelay?: number;
}

export default function useAutoHide({
  enabled,
  hideDelay = DEFAULT_HIDE_DELAY,
}: Props) {
  const timeoutRef = useRef<any>(null);
  const [visible, setVisible] = useState<boolean>(!enabled);
  const onMouseMove = useCallback(
    throttle(() => {
      if (!enabled) return;
      if (!visible) {
        setVisible(true);
      }
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setVisible(false);
      }, hideDelay);
    }, 1000),
    [enabled]
  );

  useEffect(() => {
    addEventListener("mousemove", onMouseMove);
    return () => {
      removeEventListener("mousemove", onMouseMove);
    };
  }, [enabled]);

  return visible;
}
