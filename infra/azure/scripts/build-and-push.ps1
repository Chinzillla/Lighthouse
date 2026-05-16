param(
  [Parameter(Mandatory = $true)]
  [string] $AcrName,

  [Parameter(Mandatory = $true)]
  [string] $Tag
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$acrLoginServer = az acr show --name $AcrName --query loginServer -o tsv

az acr login --name $AcrName

docker build -f (Join-Path $repoRoot "Dockerfile") -t "$acrLoginServer/lighthouse:$Tag" $repoRoot
docker build -f (Join-Path $repoRoot "Dockerfile.tools") -t "$acrLoginServer/lighthouse-kafka-metrics:$Tag" $repoRoot
docker build -f (Join-Path $repoRoot "observability/prometheus.Dockerfile") -t "$acrLoginServer/lighthouse-prometheus:$Tag" $repoRoot

docker push "$acrLoginServer/lighthouse:$Tag"
docker push "$acrLoginServer/lighthouse-kafka-metrics:$Tag"
docker push "$acrLoginServer/lighthouse-prometheus:$Tag"

Write-Output "LIGHTHOUSE_IMAGE=$acrLoginServer/lighthouse:$Tag"
Write-Output "KAFKA_METRICS_IMAGE=$acrLoginServer/lighthouse-kafka-metrics:$Tag"
Write-Output "PROMETHEUS_IMAGE=$acrLoginServer/lighthouse-prometheus:$Tag"
