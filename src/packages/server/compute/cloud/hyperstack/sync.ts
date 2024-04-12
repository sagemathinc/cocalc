/*
Ensure that any VM's and disks in hyperstack match what we think exists
according to the database.

This is critical to do periodically, since otherwise if a nodejs process crashes
(or there is a bug, etc.), e.g., when creating a VM, then (1) we might pay for
that VM as it is running, but not be using or charging for it, and (2) a user
might get blocked from creating their VM.  Similar remarks about to disks.
*/

export async function globalResourceSync() {
  console.log("TODO");
}
