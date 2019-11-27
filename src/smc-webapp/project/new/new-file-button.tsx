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
  loading?: boolean;
  children?: React.ReactNode;
}

export const NewFileButton = React.memo(function NewFileButton({
  name,
  icon,
  on_click,
  ext,
  className,
  disabled,
  loading,
  children
}: Props) {
  let displayed_icon = <Icon name={icon} />;

  if (loading) {
    displayed_icon = <Icon name="cc-icon-cocalc-ring" spin />;
  }

  return (
    <Button
      onClick={(): void => {
        on_click?.(ext);
      }}
      style={{ marginRight: "5px", marginBottom: "5px" }}
      className={className}
      disabled={disabled || loading}
    >
      {displayed_icon}
      <Space />
      {name}
      {children}
    </Button>
  );
});
