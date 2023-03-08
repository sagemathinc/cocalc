/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The kernel's logo display
*/

import { CSSProperties, useState } from "react";
import { get_logo_url } from "./server-urls";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

const DEFAULT_HEIGHT = "24px"; // this matches the rest of the status bar.

interface Props {
  kernel: string | null;
  kernel_info_known?: boolean;
  size?: string;
  style?: CSSProperties;
}

export default function Logo({
  kernel,
  kernel_info_known,
  size = DEFAULT_HEIGHT,
  style,
}: Props) {
  const { project_id } = useFrameContext();
  const [logo_failed, set_logo_failed] = useState<string | undefined>(
    undefined
  );

  if (logo_failed === kernel || kernel == null) {
    return <img style={{ width: "0px", height: size }} />;
  } else {
    const src = get_logo_url(project_id, kernel);
    return (
      <img
        src={src}
        style={{ width: size, height: size, ...style }}
        onError={() => {
          if (kernel_info_known) set_logo_failed(kernel);
        }}
      />
    );
  }
}
