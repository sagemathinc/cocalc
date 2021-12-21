/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Icon } from "@cocalc/frontend/components/icon";
import { CSSProperties, ReactNode, useEffect, useState } from "react";
import useIsMounted from "lib/hooks/mounted";

interface Props {
  delay?: number;
  style?: CSSProperties;
  children?: ReactNode;
  before?: ReactNode;
}

export default function Loading({ delay, style, children, before }: Props) {
  const [show, setShow] = useState<boolean>(false);
  const isMounted = useIsMounted();
  useEffect(() => {
    setTimeout(() => {
      if (!isMounted.current) return;
      setShow(true);
    }, delay ?? 500);
  }, []);

  if (!show) {
    return <>{before}</>;
  }
  return (
    <div style={{ color: "#666", ...style }}>
      <Icon name="spinner" spin /> {children ?? <>Loading...</>}
    </div>
  );
}
