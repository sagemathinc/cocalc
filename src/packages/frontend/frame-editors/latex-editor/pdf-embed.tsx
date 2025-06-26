/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is a renderer using the embed tag, so works with browsers that have a PDF viewer plugin.
*/

import { React } from "@cocalc/frontend/app-framework";
import { raw_url } from "@cocalc/frontend/frame-editors/frame-tree/util";

export interface Props {
  actions: any;
  id: string;
  project_id: string;
  is_current: boolean;
  path: string;
  reload?: number;
}

export const PDFEmbed: React.FC<Props> = React.memo((props: Props) => {
  const { actions, id, project_id, is_current, path, reload } = props;

  const embedRef = React.useRef<any>(null);

  function render_embed(): React.JSX.Element {
    const src: string = `${raw_url(project_id, path)}?param=${reload}`;
    return (
      <embed
        ref={embedRef}
        width={"100%"}
        height={"100%"}
        src={src}
        type={"application/pdf"}
      />
    );
  }

  function focus(): void {
    actions.set_active_id(id);
    $(embedRef.current).focus();
  }

  function render_clickable(): React.JSX.Element {
    return (
      <>
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            zIndex: is_current ? -1 : 1,
          }}
          onMouseEnter={focus}
        />
        {render_embed()}
      </>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
      }}
    >
      {render_clickable()}
    </div>
  );
});
