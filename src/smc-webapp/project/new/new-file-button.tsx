import * as React from "react";

import { Button } from "cocalc-ui";
import { Icon, Space } from "../../r_misc";

interface Props {
  name: string;
  icon: string;
  on_click: (ext?: string) => void;
  ext?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean; // TODO Read semantics from download option!
  children?: React.ReactNode;
}

export const NewFileButton = React.memo(function NewFileButton({
  name,
  icon,
  on_click,
  ext,
  className,
  disabled,
  children
}: Props) {
  return (
    <Button
      onClick={(): void => {
        on_click?.(ext);
      }}
      style={{ marginRight: "5px", marginBottom: "5px" }}
      className={className}
      disabled={disabled}
    >
      <Icon name={icon} />
      <Space />
      {name}
      {children}
    </Button>
  );
});
