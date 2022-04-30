import { ReactNode, useEffect, useState } from "react";
import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";

interface Props {
  delayMs: number;
  children?: ReactNode;
}

export default function Delay({ children, delayMs }: Props) {
  const [show, setShow] = useState<boolean>(false);

  const isMountedRef = useIsMountedRef();

  useEffect(() => {
    setTimeout(() => {
      if (!isMountedRef.current) return;
      setShow(true);
    }, delayMs);
  }, []);

  return show ? <>{children}</> : <></>;
}
