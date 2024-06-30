import getSupportUrl from "@cocalc/frontend/support/url";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useEffect, useState } from "react";

export function liveDemoUrl(context) {
  return getSupportUrl({
    subject: "Live Demo Request",
    type: "question",
    body: `I would like to request a live demo on CoCalc!\n\nWHEN IS A GOOD TIME (include timezone!): [REQUIRED]\n\nTELLS US AS MUCH AS YOU CAN ABOUT YOUR INTENDED USE OF COCALC: [REQUIRED]\n\n`,
    hideExtra: true,
    context,
    url: "",
    required: "[REQUIRED]",
  });
}

interface Props {
  context: string;
  label?;
}

export default function LiveDemo({ context, label }: Props) {
  const [href, setHref] = useState<string | undefined>(undefined);
  useEffect(() => {
    setHref(liveDemoUrl(context));
  }, []);
  return (
    <Button href={href} type="primary">
      <Icon name="users" /> {label ?? "Get a Live Demo"}
    </Button>
  );
}
