import * as React from "react";
import { Button } from "../shared";

interface Props {
  id_token: string;
  nonce: string;
}

export function SubmitAssignmentButton({ id_token, nonce }: Props) {
  return (
    <>
      <input type="hidden" name="token_id" value={id_token} />
      <Button type="submit" name="state" value={nonce}>
        Finish
      </Button>
    </>
  );
}
