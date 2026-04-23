import { gql } from '@apollo/client';

const gqlQueries = {
  dashboardMetrics: gql`
    query DashboardMetrics {
      dashboardMetrics {
        status
        brokerCount
        exporterUp
        partitionCount
        topicCount
        totalLogEndOffset
      }
    }
  `,
};

export default gqlQueries;
