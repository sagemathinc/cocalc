const {persist} = require('@cocalc/backend/nats/sync')
const fs = require('fs')

async function main() {
const v = fs.readFileSync('all').toString().split('\n');

let i = -1;
let start = 1000;
let stop = 2000;
for(let x of v) {
  i += 1;  
  if (i >= stop) break;
  if (i<start) continue;
  const path = `done/${i}`;
  if(fs.existsSync(path)) {
	  console.log("skipping ", i, "since already done");
	  continue;
  }
  console.log("doing i=", i);
  const project_id = x.slice('project-'.length);
  const t0 = Date.now();
  await persist({project_id});
  fs.writeFileSync(path,`${Date.now()-t0}`);
  console.log("finished i=", i, 'time=', Date.now()-t0);
}
process.exit(0);
}

main()
