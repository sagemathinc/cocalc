
export function handleErrorMessage(mesg) {
  if (mesg?.error) {
    if (mesg.error.startsWith("Error: ")) {
      throw Error(mesg.error.slice("Error: ".length));
    } else {
      throw Error(mesg.error);
    }
  }
  return mesg;
}