on admin0, the test setup, config file for supervisor:

    ln -s /home/salvus/smc/src/smc-build/prometheus/prometheus.supervisor /etc/supervisor/conf.d/prometheus.conf

the run via `supervisorctl reload` (or if config already known `restart all`)

