import { optionKey, HyperstackPriceData } from "./pricing";

// NOTE: keys here also assumed to be the flavors without a gpu below!
const HUMAN = {
  s: "n1-cpu-extrasmall",
  m: "n1-cpu-verysmall",
  l: "n1-cpu-small",
  xxl: "n1-cpu-large",
};

export function humanFlavor(flavor_name: string) {
  return HUMAN[flavor_name] ?? flavor_name;
}

export function hasGPU(
  configuration: { region_name: string; flavor_name: string },
  priceData: HyperstackPriceData,
): boolean {
  const key = optionKey(configuration);
  const data = priceData.options[key];
  return !!data?.gpu;
}

export function hasLocalSSD(
  configuration: { region_name: string; flavor_name: string },
  priceData: HyperstackPriceData,
): boolean {
  const key = optionKey(configuration);
  const data = priceData.options[key];
  return !!data?.ephemeral;
}
