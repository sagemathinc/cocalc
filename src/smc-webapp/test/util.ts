const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// TODO: Make generic on expected return type (if given)
// Fails with probability = `failure_odds` after given `wait_time` in ms.
// On success will return `expected_return`
export async function fake_async_client_action({
  wait_time = 5000, // ms
  expected_return = undefined,
  failure_odds = 0, // Between 0 and 1
}: {
  wait_time?: number;
  expected_return?: any;
  failure_odds?: number;
} = {}) {
  console.log(`I'm gonna fail with ${failure_odds * 100}% probability`)
  await delay(wait_time);
  if (Math.random() < failure_odds) {
    console.log("Failed this time!")
    throw new Error("Mock test client randomly failed!");
  }
  return expected_return;
}
