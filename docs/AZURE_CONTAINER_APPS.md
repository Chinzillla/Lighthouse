# Azure Container Apps Production Demo

This guide deploys Lighthouse as a production-looking demo on Azure Container
Apps with Azure Event Hubs' Kafka endpoint, Azure SQL replay job persistence,
Azure Container Registry images, and internal-only Prometheus/exporter services.

## Architecture

```text
Internet
  -> lighthouse Container App, external ingress on 3000
  -> Next.js UI and REST API
  -> Azure SQL replay job store
  -> Azure Event Hubs Kafka endpoint
  -> internal prometheus Container App
  -> internal kafka-metrics Container App
  -> Azure Event Hubs Kafka endpoint
```

Only Lighthouse is public. Prometheus and `kafka-metrics` use internal Container
Apps ingress and are queried only from inside the Container Apps environment.

Lighthouse is pinned to `minReplicas=1` and `maxReplicas=1` for this milestone
because replay jobs still execute in the app process.

## Resources

The Bicep template in `infra/azure/main.bicep` creates:

- Log Analytics workspace
- Container Apps managed environment
- Azure Container Registry
- user-assigned managed identity with `AcrPull`
- Azure SQL server and `lighthouse` database
- Azure Event Hubs namespace and demo event hubs
- `lighthouse` public Container App
- `prometheus` internal Container App
- `kafka-metrics` internal Container App

## Prerequisites

- Azure CLI with Bicep support
- Docker
- Node.js 24 and npm 10+
- Azure subscription permissions to create the resources above
- a SQL administrator password stored outside git

Validate local quality gates before building images:

```bash
npm run verify
az bicep build --file infra/azure/main.bicep
```

## Build Images

Create the resource group and first ACR before building images, or use an
existing ACR:

```powershell
az group create --name rg-lighthouse-demo --location eastus
az acr create --resource-group rg-lighthouse-demo --name <acr-name> --sku Basic
infra/azure/scripts/build-and-push.ps1 -AcrName <acr-name> -Tag demo-001
```

The script builds and pushes:

- `<acr>.azurecr.io/lighthouse:<tag>`
- `<acr>.azurecr.io/lighthouse-kafka-metrics:<tag>`
- `<acr>.azurecr.io/lighthouse-prometheus:<tag>`

The Prometheus image uses `observability/prometheus.Dockerfile` and packages
`observability/prometheus.azure.yml`, which scrapes `kafka-metrics:9308`.

## Deploy

Use deployment-time parameters for secrets:

```powershell
$sqlPassword = Read-Host "SQL admin password" -AsSecureString
infra/azure/scripts/deploy.ps1 `
  -ResourceGroup rg-lighthouse-demo `
  -Location eastus `
  -NamePrefix lhdemo `
  -LighthouseImage "<acr>.azurecr.io/lighthouse:demo-001" `
  -KafkaMetricsImage "<acr>.azurecr.io/lighthouse-kafka-metrics:demo-001" `
  -PrometheusImage "<acr>.azurecr.io/lighthouse-prometheus:demo-001" `
  -SqlAdministratorLogin lighthouseadmin `
  -SqlAdministratorPassword $sqlPassword
```

The template sets Event Hubs Kafka credentials and Azure SQL credentials as
Container Apps secrets. Do not put real values in parameter example files.

## Event Hubs Kafka Settings

For Lighthouse, the exporter, and the smoke script:

```text
KAFKA_BROKERS=<namespace>.servicebus.windows.net:9093
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=$ConnectionString
KAFKA_SASL_PASSWORD=<Event Hubs connection string secret>
```

Run the KafkaJS smoke path:

```powershell
$env:KAFKA_BROKERS="<namespace>.servicebus.windows.net:9093"
$env:KAFKA_SSL="true"
$env:KAFKA_SASL_MECHANISM="plain"
$env:KAFKA_SASL_USERNAME='$ConnectionString'
$env:KAFKA_SASL_PASSWORD="<event-hubs-connection-string>"
npm.cmd run kafka:eventhubs:smoke -- --source orders --destination orders-replay
```

The script lists metadata, reads offsets, probes timestamp offset lookup,
produces to the destination event hub, and consumes a smoke message. If timestamp
offset lookup fails for Event Hubs, use offset-range replay for the Azure demo
and treat timestamp replay as follow-up validation.

## Azure SQL Replay Jobs

Container Apps sets:

```text
LIGHTHOUSE_JOB_STORE=azure-sql
LIGHTHOUSE_SQL_CONNECTION_STRING=<secret>
```

Local development remains SQLite by default:

```text
LIGHTHOUSE_JOB_STORE=sqlite
LIGHTHOUSE_DB_PATH=data/lighthouse.sqlite
```

Optional real Azure SQL integration check:

```powershell
$env:LIGHTHOUSE_JOB_STORE="azure-sql"
$env:LIGHTHOUSE_SQL_CONNECTION_STRING="<sql-connection-string>"
npm.cmd run replay:jobs -- create --source orders --destination orders-replay --partition 0 --start 0 --end 0 --job-id azure-sql-smoke
npm.cmd run replay:jobs -- show --job-id azure-sql-smoke
```

Default CI does not require Azure SQL credentials. Store contract tests use a
mock Azure SQL request layer.

## Smoke Tests

After deployment, capture the Bicep output `lighthouseUrl`, then run:

```bash
curl https://<lighthouse-url>/api/health
curl https://<lighthouse-url>/api/dashboard-metrics
curl https://<lighthouse-url>/api/jobs
```

Demo replay flow:

1. Create a draft job from the UI or `POST /api/jobs`.
2. Preview the job.
3. Start the job.
4. Restart the Lighthouse Container App.
5. Confirm the job record is still returned by `GET /api/jobs/:jobId`.

Confirm internal-only services:

```powershell
az containerapp show -g rg-lighthouse-demo -n prometheus --query properties.configuration.ingress.external
az containerapp show -g rg-lighthouse-demo -n kafka-metrics --query properties.configuration.ingress.external
```

Both should return `false`.

Confirm the one-replica guardrail:

```powershell
az containerapp show -g rg-lighthouse-demo -n lighthouse --query properties.template.scale
```

`minReplicas` and `maxReplicas` should both be `1`.

## Logs And Runbook

Use `infra/azure/log-analytics.kql` for startup errors, Prometheus scrape
failures, Kafka/Event Hubs authentication failures, and SQL connection failures.

Useful live checks:

```powershell
az containerapp logs show -g rg-lighthouse-demo -n lighthouse --follow
az containerapp logs show -g rg-lighthouse-demo -n kafka-metrics --follow
az containerapp logs show -g rg-lighthouse-demo -n prometheus --follow
```

## GitHub Actions

`.github/workflows/azure-container-apps.yml` provides a manual deployment path.
It uses OIDC through `azure/login`, runs `npm run verify`, builds and pushes all
three images to ACR, validates Bicep, and deploys the Container Apps.

Configure the `azure-demo` environment with the variables and secrets listed in
`infra/azure/README.md`.

## Teardown

For a disposable demo resource group:

```powershell
az group delete --name rg-lighthouse-demo --yes
```

For shared resource groups, delete the named resources from the Bicep outputs
instead of deleting the group.

## Known Limitations

- replay execution is in-process, so Lighthouse is intentionally single-replica
- timestamp replay on Event Hubs depends on KafkaJS timestamp offset support for
  the namespace and should be validated before demoing
- no authentication, custom domain, WAF, rate limiting, or budget alerts yet
- Prometheus storage is ephemeral in this first demo milestone
- SQL uses a deployment-time connection string secret; managed identity database
  auth is a hardening follow-up

## Hardening Roadmap

- split replay execution into a dedicated worker Container App
- add Azure Service Bus or Azure Queue Storage for replay commands and
  cancellation messages
- remove the single-replica restriction after replay is queue-backed
- add authentication, rate limiting, custom domain, managed TLS, and budget
  alerts
- move SQL auth to Entra ID managed identity
