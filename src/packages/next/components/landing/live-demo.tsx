import { Button } from "antd";
import { useEffect, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import getSupportUrl from "@cocalc/frontend/support/url";

export function liveDemoUrl(context) {
  return getSupportUrl({
    subject: "Contact Us!",
    type: "chat",
    context,
    url: "",
  });
}

interface Props {
  context: string;
  label?;
  type?;
}

export default function LiveDemo({ context, label, type }: Props) {
  const [href, setHref] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHref(liveDemoUrl(context));
  }, []);
  return (
    <Button href={href} type={type}>
      <Icon name="users" /> {label ?? "Contact Us!"}
    </Button>
  );
}
