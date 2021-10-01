// Route given by an account or organization name.

import getOwner from "lib/names/owner";
import getAccountInfo from "lib/share/get-account-info";
import Account from "components/account/account";
import withCustomize from "lib/with-customize";

export default function Owner(props) {
  if (props.type == "account") {
    return <Account {...props} />;
  }
  // TODO
  return (
    <div style={{ margin: "30px" }}>
      <h1>Organization: {props.owner}</h1>
      Organization pages are under construction and not yet available.
    </div>
  );
}

export async function getServerSideProps(context) {
  const { owner } = context.params;
  let info;
  try {
    info = await getOwner(owner);
  } catch (_err) {
    //console.log(_err);
    return { notFound: true };
  }
  if (info.type == "account") {
    const accountInfo = await getAccountInfo(info.owner_id);
    return await withCustomize({ context, props: { ...info, ...accountInfo } });
  }

  return await withCustomize({ context, props: { owner, ...info } });
}
