import { CellOutput } from "@cocalc/frontend/jupyter/cell-output";
import { fromJS } from "immutable";
import { useFrameContext } from "../../hooks";
import { path_split } from "@cocalc/util/misc";

// Support for all the output Jupyter MIME types must be explicitly loaded.
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-frontend";

export default function Output({ element }) {
  const { project_id, path } = useFrameContext();
  return (
    <CellOutput
      id={element.id}
      cell={fromJS(element.data)}
      project_id={project_id}
      directory={path_split(path).head}
      trust={true}
      complete={false}
      hidePrompt
    />
  );
}
