param(
  [Parameter(Mandatory = $true)]
  [string] $ResourceGroup,

  [Parameter(Mandatory = $true)]
  [string] $Location,

  [Parameter(Mandatory = $true)]
  [string] $NamePrefix,

  [Parameter(Mandatory = $true)]
  [string] $LighthouseImage,

  [Parameter(Mandatory = $true)]
  [string] $KafkaMetricsImage,

  [Parameter(Mandatory = $true)]
  [string] $PrometheusImage,

  [Parameter(Mandatory = $true)]
  [string] $SqlAdministratorLogin,

  [Parameter(Mandatory = $true)]
  [securestring] $SqlAdministratorPassword
)

$ErrorActionPreference = "Stop"

$templatePath = Join-Path $PSScriptRoot "..\main.bicep"
$plainSqlPassword = ConvertFrom-SecureString $SqlAdministratorPassword -AsPlainText

az group create `
  --name $ResourceGroup `
  --location $Location `
  --tags app=lighthouse environment=demo

az deployment group create `
  --resource-group $ResourceGroup `
  --template-file $templatePath `
  --parameters `
    namePrefix=$NamePrefix `
    location=$Location `
    lighthouseImage=$LighthouseImage `
    kafkaMetricsImage=$KafkaMetricsImage `
    prometheusImage=$PrometheusImage `
    sqlAdministratorLogin=$SqlAdministratorLogin `
    sqlAdministratorPassword=$plainSqlPassword
