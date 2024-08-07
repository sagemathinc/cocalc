/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Button bar for media viewer

For now we just pass in a single function and don't bother with actions/redux, etc.,
since there is no state or need for it...
*/



import { Icon } from "../../components";
import { Button } from "../../antd-bootstrap";

interface Props {
  refresh: () => void;
}

export const MediaViewerButtonBar: React.FC<Props> = ({ refresh }: Props) => {
  return (
    <div style={{ padding: "0 1px" }}>
      <Button
        title={"Reload this, showing the latest version on disk."}
        onClick={refresh}
      >
        <Icon name={"repeat"} /> Reload
      </Button>
    </div>
  );
};
