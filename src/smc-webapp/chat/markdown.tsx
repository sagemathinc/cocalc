import { React } from "../app-framework";
import { Markdown as Markdown0 } from "../r_misc";

interface Props {
  value: string;
  project_id?: string;
  file_path?: string;
  className?: string;
}

export const Markdown: React.FC<Props> = ({
  value,
  project_id,
  file_path,
  className,
}) => {
  // the marginBottom offsets that markdown wraps everything in a p tag
  return (
    <div style={{ marginBottom: "-10px" }}>
      <Markdown0
        value={value}
        project_id={project_id}
        file_path={file_path}
        className={className}
        checkboxes={true}
      />
    </div>
  );
};
