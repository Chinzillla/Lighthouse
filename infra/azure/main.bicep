targetScope = 'resourceGroup'

@description('Short lowercase prefix used for globally unique Azure resource names.')
@minLength(5)
@maxLength(12)
param namePrefix string

@description('Azure region for all regional resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Container image for the public Lighthouse app.')
param lighthouseImage string

@description('Container image for the internal Kafka metrics exporter.')
param kafkaMetricsImage string

@description('Container image for Prometheus with the Azure scrape config packaged into the image.')
param prometheusImage string

@description('SQL administrator login. Use a deployment-time value, not a committed secret.')
param sqlAdministratorLogin string

@secure()
@description('SQL administrator password. Use a deployment-time value, not a committed secret.')
param sqlAdministratorPassword string

@description('Event Hub names that Lighthouse can use for demos and smoke tests.')
param eventHubNames array = [
  'orders'
  'payments'
  'orders-replay'
]

@description('Tags applied to resources.')
param tags object = {}

var suffix = uniqueString(resourceGroup().id, namePrefix)
var acrName = toLower(replace('${namePrefix}${suffix}acr', '-', ''))
var containerAppsEnvironmentName = '${namePrefix}-apps-${suffix}'
var eventHubsNamespaceName = '${namePrefix}-eh-${suffix}'
var identityName = '${namePrefix}-aca-${suffix}'
var logAnalyticsName = '${namePrefix}-logs-${suffix}'
var sqlDatabaseName = 'lighthouse'
var sqlServerName = take('${namePrefix}-sql-${suffix}', 63)

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource appIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
  tags: tags
}

resource acrPullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, appIdentity.id, 'AcrPull')
  scope: containerRegistry
  properties: {
    principalId: appIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
  }
}

resource containerAppsEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: containerAppsEnvironmentName
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: sqlServerName
  location: location
  tags: tags
  properties: {
    administratorLogin: sqlAdministratorLogin
    administratorLoginPassword: sqlAdministratorPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    version: '12.0'
  }
}

resource sqlAllowAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  name: 'AllowAzureServices'
  parent: sqlServer
  properties: {
    endIpAddress: '0.0.0.0'
    startIpAddress: '0.0.0.0'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  name: sqlDatabaseName
  parent: sqlServer
  location: location
  tags: tags
  sku: {
    name: 'Basic'
    tier: 'Basic'
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648
  }
}

resource eventHubsNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: eventHubsNamespaceName
  location: location
  tags: tags
  sku: {
    capacity: 1
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    disableLocalAuth: false
    isAutoInflateEnabled: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource eventHubs 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = [
  for eventHubName in eventHubNames: {
    name: eventHubName
    parent: eventHubsNamespace
    properties: {
      messageRetentionInDays: 1
      partitionCount: eventHubName == 'orders' ? 6 : 3
    }
  }
]

resource eventHubsKafkaPolicy 'Microsoft.EventHub/namespaces/authorizationRules@2024-01-01' = {
  name: 'lighthouse-kafka'
  parent: eventHubsNamespace
  properties: {
    rights: [
      'Listen'
      'Send'
    ]
  }
}

var sqlConnectionString = 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Initial Catalog=${sqlDatabase.name};Persist Security Info=False;User ID=${sqlAdministratorLogin};Password=${sqlAdministratorPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
var eventHubsKafkaConnectionString = eventHubsKafkaPolicy.listKeys().primaryConnectionString

resource kafkaMetricsApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'kafka-metrics'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 9308
        transport: 'http'
      }
      registries: [
        {
          identity: appIdentity.id
          server: containerRegistry.properties.loginServer
        }
      ]
      secrets: [
        {
          name: 'eventhubs-kafka-connection-string'
          value: eventHubsKafkaConnectionString
        }
      ]
    }
    environmentId: containerAppsEnvironment.id
    template: {
      containers: [
        {
          name: 'kafka-metrics'
          image: kafkaMetricsImage
          env: [
            {
              name: 'KAFKA_BROKERS'
              value: '${eventHubsNamespaceName}.servicebus.windows.net:9093'
            }
            {
              name: 'KAFKA_CLIENT_ID'
              value: 'lighthouse-metrics'
            }
            {
              name: 'KAFKA_SSL'
              value: 'true'
            }
            {
              name: 'KAFKA_SASL_MECHANISM'
              value: 'plain'
            }
            {
              name: 'KAFKA_SASL_USERNAME'
              value: '$ConnectionString'
            }
            {
              name: 'KAFKA_SASL_PASSWORD'
              secretRef: 'eventhubs-kafka-connection-string'
            }
            {
              name: 'METRICS_PORT'
              value: '9308'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/metrics'
                port: 9308
              }
              initialDelaySeconds: 20
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/metrics'
                port: 9308
              }
              initialDelaySeconds: 10
              periodSeconds: 15
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    acrPullRole
    eventHubs
  ]
}

resource prometheusApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'prometheus'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        targetPort: 9090
        transport: 'http'
      }
      registries: [
        {
          identity: appIdentity.id
          server: containerRegistry.properties.loginServer
        }
      ]
    }
    environmentId: containerAppsEnvironment.id
    template: {
      containers: [
        {
          name: 'prometheus'
          image: prometheusImage
          args: [
            '--config.file=/etc/prometheus/prometheus.yml'
            '--storage.tsdb.retention.time=2h'
          ]
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/-/ready'
                port: 9090
              }
              initialDelaySeconds: 10
              periodSeconds: 15
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    acrPullRole
    kafkaMetricsApp
  ]
}

resource lighthouseApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'lighthouse'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${appIdentity.id}': {}
    }
  }
  properties: {
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          identity: appIdentity.id
          server: containerRegistry.properties.loginServer
        }
      ]
      secrets: [
        {
          name: 'eventhubs-kafka-connection-string'
          value: eventHubsKafkaConnectionString
        }
        {
          name: 'azure-sql-connection-string'
          value: sqlConnectionString
        }
      ]
    }
    environmentId: containerAppsEnvironment.id
    template: {
      containers: [
        {
          name: 'lighthouse'
          image: lighthouseImage
          env: [
            {
              name: 'KAFKA_BROKERS'
              value: '${eventHubsNamespaceName}.servicebus.windows.net:9093'
            }
            {
              name: 'KAFKA_CLIENT_ID'
              value: 'lighthouse'
            }
            {
              name: 'KAFKA_SSL'
              value: 'true'
            }
            {
              name: 'KAFKA_SASL_MECHANISM'
              value: 'plain'
            }
            {
              name: 'KAFKA_SASL_USERNAME'
              value: '$ConnectionString'
            }
            {
              name: 'KAFKA_SASL_PASSWORD'
              secretRef: 'eventhubs-kafka-connection-string'
            }
            {
              name: 'LIGHTHOUSE_JOB_STORE'
              value: 'azure-sql'
            }
            {
              name: 'LIGHTHOUSE_SQL_CONNECTION_STRING'
              secretRef: 'azure-sql-connection-string'
            }
            {
              name: 'PROMETHEUS_API'
              value: 'http://prometheus:9090'
            }
            {
              name: 'PROMETHEUS_ALLOWED_HOSTS'
              value: 'prometheus:9090,prometheus'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              initialDelaySeconds: 30
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 15
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
  dependsOn: [
    acrPullRole
    prometheusApp
    sqlAllowAzureServices
  ]
}

output acrLoginServer string = containerRegistry.properties.loginServer
output containerAppsEnvironment string = containerAppsEnvironment.name
output eventHubsKafkaBroker string = '${eventHubsNamespaceName}.servicebus.windows.net:9093'
output lighthouseUrl string = 'https://${lighthouseApp.properties.configuration.ingress.fqdn}'
output logAnalyticsWorkspace string = logAnalytics.name
output prometheusInternalHost string = prometheusApp.properties.configuration.ingress.fqdn
output kafkaMetricsInternalHost string = kafkaMetricsApp.properties.configuration.ingress.fqdn
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
