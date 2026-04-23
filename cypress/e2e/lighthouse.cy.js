describe('Lighthouse operations console', () => {
  function stubDashboardMetrics() {
    cy.intercept('POST', '/api/graphql', {
      body: {
        data: {
          dashboardMetrics: {
            __typename: 'DashboardMetrics',
            brokerCount: '3',
            exporterUp: '1',
            partitionCount: '9',
            status: 'ok',
            topicCount: '4',
            totalLogEndOffset: '12500',
          },
        },
      },
    }).as('dashboardMetrics');

    cy.visit('/');
    cy.wait('@dashboardMetrics');
  }

  it('loads the current dashboard shell', () => {
    stubDashboardMetrics();

    cy.contains('Lighthouse').should('be.visible');
    cy.contains('Kafka operations console').should('be.visible');
    cy.contains('Cluster signals with a cleaner path to replay tooling.').should(
      'be.visible'
    );
  });

  it('renders primary navigation', () => {
    stubDashboardMetrics();

    cy.get('nav[aria-label="Primary navigation"]').within(() => {
      cy.contains('Metrics').should('have.attr', 'href', '#metrics');
      cy.contains('Roadmap').should('have.attr', 'href', '#roadmap');
      cy.contains('GitHub').should('have.attr', 'href').and('include', 'github.com');
    });
  });

  it('renders Kafka metric values from GraphQL', () => {
    stubDashboardMetrics();

    cy.contains('Metrics online').should('be.visible');
    cy.get('[aria-label="Kafka metrics"]').within(() => {
      cy.contains('Partition Count').should('be.visible');
      cy.contains('9').should('be.visible');
      cy.contains('Broker Signal').should('be.visible');
      cy.contains('3').should('be.visible');
      cy.contains('Log End Offset').should('be.visible');
      cy.contains('12,500').should('be.visible');
      cy.contains('Metrics Exporter').should('be.visible');
      cy.contains('1').should('be.visible');
    });
  });

  it('shows chart panels and roadmap', () => {
    stubDashboardMetrics();

    cy.contains('Kafka Activity').should('be.visible');
    cy.contains('Topic Inventory').should('be.visible');
    cy.contains('Foundation first, replay engine next.').should('be.visible');
  });

  it('shows Prometheus unavailable when GraphQL fails', () => {
    cy.intercept('POST', '/api/graphql', {
      body: {
        errors: [{ message: 'Prometheus unavailable' }],
      },
      statusCode: 500,
    }).as('dashboardMetricsFailure');

    cy.visit('/');
    cy.wait('@dashboardMetricsFailure');

    cy.contains('Prometheus unavailable').should('be.visible');
    cy.get('[aria-label="Kafka metrics"]').should('be.visible');
  });
});
