import { getData } from "@cocalc/gcloud-pricing-calculator";

export default async function getPricingData() {
  return await getData();
}
