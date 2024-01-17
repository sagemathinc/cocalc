/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tabs for the open files in a project.
*/

import { Icon } from "@cocalc/frontend/components";
import { Flex } from "antd";

import { CSS } from "@cocalc/frontend/app-framework";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { PathNavigator } from "@cocalc/frontend/project/explorer/path-navigator";
import { path_split, separate_file_extension } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

interface FileTabActiveFileTopbarProps {
  activeKey: string; // an empty string means there is no active file
  style?: CSS;
}

export function FileTabActiveFileTopbar({
  activeKey,
  style,
}: FileTabActiveFileTopbarProps) {
  const { project_id } = useProjectContext();
  const isEmpty = activeKey === "";

  function renderIcon() {
    const { icon } = file_options(activeKey);
    return <Icon name={icon} />;
  }

  function renderName() {
    const { tail: fn } = path_split(activeKey);
    const { name: base, ext = "" } = separate_file_extension(fn);

    return (
      <Flex flex={1}>
        {base}
        {ext === "" ? undefined : (
          <span style={{ color: COLORS.FILE_EXT }}>{`.${ext}`}</span>
        )}
      </Flex>
    );
  }

  function renderPath() {
    return (
      <PathNavigator
        mode={"flyout"}
        project_id={project_id}
        className={"cc-project-flyout-path-navigator"}
      />
    );
  }

  function renderContent() {
    if (isEmpty) {
      return <></>;
    } else {
      return (
        <>
          {renderPath()}
          {renderIcon()}
          {renderName()}
        </>
      );
    }
  }

  function renderStyle(): CSS {
    return {
      display: "flex",
      paddingLeft: "5px",
      fontSize: "120%",
      borderBottom: isEmpty ? undefined : `1px solid ${COLORS.GRAY_L}`,
      ...style,
    };
  }

  return (
    <Flex
      justify="left"
      align="center"
      flex={1}
      gap="small"
      style={renderStyle()}
    >
      {renderContent()}
    </Flex>
  );
}
