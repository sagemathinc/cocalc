import { getData } from "@cocalc/gcloud-pricing-calculator";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

export default async function getPricingData() {
  const { compute_servers_markup_percentage: markup } =
    await getServerSettings();
  const data = await getData();
  return { ...data, markup: markup ?? 30 };
}
