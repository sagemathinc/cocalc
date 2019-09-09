import * as React from "react";
import { Button } from "../shared";

interface Props {
  project_id: string;
  selected_paths: string[];
  excluded_paths: string[];
  id_token: string;
  nonce: string;
}

export function SubmitAssignmentButton({
  project_id,
  selected_paths,
  excluded_paths,
  id_token,
  nonce
}: Props) {
  return (
    <>
      <input type="hidden" name="project_id" value={project_id} />
      <input type="hidden" name="selected_paths" value={selected_paths} />
      <input type="hidden" name="excluded_paths" value={excluded_paths} />
      <input type="hidden" name="token_id" value={id_token} />
      <Button type="submit" name="state" value={nonce}>
        Finish
      </Button>
    </>
  );
}
