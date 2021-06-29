import { program } from "./init-program";
import initInfoJson from "./info-json";

async function main() {
  await initInfoJson();
  const client = new Client(INFO.project_id, winston);
}

main();
