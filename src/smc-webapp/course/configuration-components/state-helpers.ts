import { useState } from "react";

export function useConfirmation<T extends any[], U>(
  confirmation: (...args: T) => U,
  init = false
): [boolean, (...args: T) => U, () => void, () => void] {
  const [confirmation_is_open, set_confirmation] = useState(init);
  function confirm(...args: T): U {
    set_confirmation(false);
    return confirmation(...args);
  }
  function close_confirmation() {
    set_confirmation(false);
  }
  function open_confirmation() {
    set_confirmation(true);
  }
  return [confirmation_is_open, confirm, open_confirmation, close_confirmation];
}
