/* 
create a cluster consisting of $n$ distinct nodejs processes, each
listening on separate ports on localhost.  They are all connected.
*/

interface Node {
  port: number;
  child; // the spawned child process
}

export class Cluster {
  nodes: Node[] = [];

  constructor(public N: number) {}

  init = async () => {
    for (let i = 0; i < this.N; i++) {
      
    }
  };
}

export async function createCluster(N: number): Promise<Cluster> {
  const C = new Cluster(N);
  await C.init();
  return C;
}
