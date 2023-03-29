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

const DEFAULT_HEIGHT = 24; // this matches the rest of the status bar.

interface Props {
  kernel: string | null;
  kernel_info_known?: boolean;
  size?: number;
  style?: CSSProperties;
  project_id?: string; // useful if no frame context...
}

export default function Logo({
  kernel,
  kernel_info_known = true,
  size = DEFAULT_HEIGHT,
  style,
  project_id,
}: Props) {
  const frame = useFrameContext();
  if (project_id == null) {
    project_id = frame.project_id;
  }
  const [logo_failed, set_logo_failed] = useState<string | undefined>(
    undefined
  );

  if (logo_failed === kernel || kernel == null) {
    return (
      <div
        style={{
          fontSize: size,
          color: "#ef6c00",
          display: "inline-block",
          width: size,
          height: size,
          lineHeight: 1,
          ...style,
        }}
      >
        {kernel?.[0]?.toUpperCase() ?? ""}
      </div>
    );
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
