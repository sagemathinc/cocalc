import { Button } from "antd";
import type { ButtonType } from "antd/es/button";
import type { ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import getSupportUrl from "@cocalc/frontend/support/url";
import { useCustomize } from "lib/customize";

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
  label?: string | ReactNode;
  btnType?: ButtonType;
}

export default function LiveDemo({ label, btnType }: Props) {
  const { supportVideoCall } = useCustomize();

  if (!supportVideoCall) {
    return null;
  }

  return (
    <Button href={supportVideoCall} type={btnType}>
      <Icon name="video-camera" /> {label ?? "Book a Demo!"}
    </Button>
  );
}
