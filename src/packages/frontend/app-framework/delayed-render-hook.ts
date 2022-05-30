import { useState } from "react";
import { useAsyncEffect } from "use-async-effect";
import { delay } from "awaiting";

export default function useDelayedRender(delay_ms: number) {
  const [render, setRender] = useState<boolean>(delay_ms <= 0);
  useAsyncEffect(async (is_mounted) => {
    if (delay_ms == 0) return;
    await delay(delay_ms);
    if (!is_mounted()) return;
    setRender(true);
  }, []);
  return render;
}
