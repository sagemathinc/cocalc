
# Dump and snapshot critical tables every 6 hours.
0 */6 * * * /home/salvus/smc/src/scripts/postgresql/smc-backup-postgres 1>/home/salvus/.smc-backup-postgres.log 2>/home/salvus/.smc-backup-postgres.err
 
# Dump entire database once per week (Saturday)
30 4 * * 6 /home/salvus/smc/src/scripts/postgresql/smc-backup-postgres-all 1>/home/salvus/.smc-backup-postgres-all.log 2>/home/salvus/.smc-backup-postgres-all.err
 
