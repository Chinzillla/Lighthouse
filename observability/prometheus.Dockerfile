FROM prom/prometheus:v2.54.1

COPY observability/prometheus.azure.yml /etc/prometheus/prometheus.yml
