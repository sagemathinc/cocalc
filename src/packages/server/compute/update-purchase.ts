export default async function updatePurchase({ server, newState }) {
  if (server.state == newState) {
    // no change in state.
    if (newState == "deprovisioned" && server.purchase_id == null) {
      // nothing to do -- purchase already cleared
      return;
    }
    if (newState != "deprovisioned" && server.purchase_id != null) {
      // nothing to do -- purchase already being recorded
      return;
    }
  }

  if (server.purchase_id == null) {
    // start a pay-as-you-go purchase
  }

  // TODO!
}
