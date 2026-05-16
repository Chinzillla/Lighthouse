# Azure Container Apps Infra

This folder contains the repeatable Azure deployment scaffold for the Lighthouse
production demo.

The deployment expects an Azure resource group and creates:

- Log Analytics workspace
- Azure Container Apps environment
- Azure Container Registry
- Azure SQL server and `lighthouse` database
- Azure Event Hubs namespace and demo event hubs
- user-assigned managed identity with ACR pull rights
- public `lighthouse` Container App
- internal-only `prometheus` and `kafka-metrics` Container Apps

Do not commit real SQL passwords, Event Hubs connection strings, publish
profiles, `.env` files, Azure state files, or generated credentials.

Prometheus is packaged from `observability/prometheus.Dockerfile` for Azure
because Container Apps does not use the local Compose bind mount. The Azure
scrape config targets the internal `kafka-metrics:9308` Container App hostname.

Validate the Bicep template:

```powershell
az bicep build --file infra/azure/main.bicep
```

Deploy with deployment-time secret values:

```powershell
$sqlPassword = Read-Host "SQL admin password" -AsSecureString
infra/azure/scripts/deploy.ps1 `
  -ResourceGroup rg-lighthouse-demo `
  -Location eastus `
  -NamePrefix lhdemo `
  -LighthouseImage "<acr>.azurecr.io/lighthouse:<tag>" `
  -KafkaMetricsImage "<acr>.azurecr.io/lighthouse-kafka-metrics:<tag>" `
  -PrometheusImage "<acr>.azurecr.io/lighthouse-prometheus:<tag>" `
  -SqlAdministratorLogin lighthouseadmin `
  -SqlAdministratorPassword $sqlPassword
```

Event Hubs exposes a Kafka-compatible endpoint. Configure Lighthouse and the
smoke script with:

```text
KAFKA_BROKERS=<namespace>.servicebus.windows.net:9093
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=$ConnectionString
KAFKA_SASL_PASSWORD=<connection string secret>
```

Smoke test KafkaJS compatibility after deploy:

```powershell
$env:KAFKA_BROKERS="<namespace>.servicebus.windows.net:9093"
$env:KAFKA_SSL="true"
$env:KAFKA_SASL_MECHANISM="plain"
$env:KAFKA_SASL_USERNAME='$ConnectionString'
$env:KAFKA_SASL_PASSWORD="<event-hubs-connection-string>"
npm.cmd run kafka:eventhubs:smoke -- --source orders --destination orders-replay
```

The script probes timestamp offset lookup and reports a warning if the namespace
does not support the KafkaJS timestamp-offset call. In that case, keep the first
Azure demo on offset-range replay.

Operational query examples live in `infra/azure/log-analytics.kql` for startup
errors, Prometheus scrape issues, Kafka/Event Hubs authentication failures, and
Azure SQL connection failures.

The optional GitHub Actions deployment workflow is
`.github/workflows/azure-container-apps.yml`. It uses OIDC and expects these
GitHub environment variables:

- `AZURE_ACR_NAME`
- `AZURE_LOCATION`
- `AZURE_NAME_PREFIX`
- `AZURE_RESOURCE_GROUP`
- `AZURE_SQL_ADMIN_LOGIN`

It expects these GitHub environment secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_SQL_ADMIN_PASSWORD`
