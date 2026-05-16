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
