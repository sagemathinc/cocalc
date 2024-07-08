import getSupportUrl from "@cocalc/frontend/support/url";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";

export function liveDemoUrl(context) {
  return getSupportUrl({
    subject: "Contact Us!",
    type: "question",
    body: `I would like to chat with a Sales Representative!\n\nWHEN IS A GOOD TIME (include timezone!): [REQUIRED]\n\nYOUR ORGANIZATION: [REQUIRED]\n\n(Only requests filled out in good faith will receive a response.)\n`,
    hideExtra: true,
    context,
    url: "",
    required: "[REQUIRED]",
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
