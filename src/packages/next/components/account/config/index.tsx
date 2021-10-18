import AccountName from "./account/name";
import Email from "./account/email";

interface Props {
  main: string;
  sub: string;
}

const Components = {
  account: {
    name: AccountName,
    email: Email,
  },
};

export default function Config({ main, sub }: Props) {
  const C = Components[main]?.[sub];
  if (C != null) {
    return <C />;
  }
  return <>TODO: Configure not yet implemented.</>;
}
