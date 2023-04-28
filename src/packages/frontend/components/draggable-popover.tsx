/*
This is just like the normal antd popover, except you can drag it around.
We don't use react-draggable, since it's too much of a pain since Popover
doesn't take a style prop...
*/

import { Popover } from "antd";

export default function DraggablePopover(props) {
  return (
    <Popover
      {...props}
      getPopupContainer={() => {
        const elt: any = $("<div></div>");
        $("body").append(elt);
        elt.draggable();
        return elt[0];
      }}
    />
  );
}
