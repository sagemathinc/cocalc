import * as React from "react";

interface Props {
  id_token: string;
  nonce: string;
  return_path: string;
}

export function SubmitAssignmentButton({
  id_token,
  nonce,
  return_path
}: Props) {
  return (
    <form method="post" action={return_path}>
      <input type="hidden" name="token_id" value={id_token} />
      <button type="submit" name="state" value={nonce}>
        Finish
      </button>
    </form>
  );
}
