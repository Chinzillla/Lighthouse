import { gql, ApolloServer } from "apollo-server-micro";
import { ApolloServerPluginLandingPageLocalDefault } from "apollo-server-core";
import { PrometheusAPI } from "../../lib/prometheusAPI";

const typeDefs = gql`
  type DashboardMetrics {
    status: String
    brokerCount: String
    exporterUp: String
    partitionCount: String
    topicCount: String
    totalLogEndOffset: String
  }

  type Query {
    dashboardMetrics: DashboardMetrics
  }
`;

const resolvers = {
  Query: {
    dashboardMetrics: async (_, __, { dataSources }) => {
      return dataSources.prometheusAPI.getDashboardMetrics();
    }
  },
};


const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  csrfPrevention: true,
  cache: "bounded",
  plugins:[
    ApolloServerPluginLandingPageLocalDefault({ embed: true }),
  ],
  dataSources: () => {
    return {
      prometheusAPI: new PrometheusAPI()
    };
  },
  context: () => {
    return {
      token: 'foo',
    };
  },
});

const startServer = apolloServer.start();

export default async function handler(req, res) {
    await startServer;
    await apolloServer.createHandler({
        path: "/api/graphql",
    })(req, res);
}

export const config = {
    api: {
        bodyParser: false,
    },
};
