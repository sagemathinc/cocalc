/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Icon } from "@cocalc/frontend/components/icon";
import { CSSProperties, useEffect, useState } from "react";
import useIsMounted from "lib/hooks/mounted";

interface Props {
  delay?: number;
  style?: CSSProperties;
}

export default function Loading({ delay, style }: Props) {
  const [show, setShow] = useState<boolean>(false);
  const isMounted = useIsMounted();
  useEffect(() => {
    setTimeout(() => {
      if (!isMounted.current) return;
      setShow(true);
    }, delay ?? 500);
  }, []);

  if (!show) {
    return <></>;
  }
  return (
    <div style={{ color: "#666", ...style }}>
      <Icon name="spinner" spin /> Saving...
    </div>
  );
}
