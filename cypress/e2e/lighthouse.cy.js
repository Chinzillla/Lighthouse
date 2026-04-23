describe('Lighthouse operations console', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('loads the current dashboard shell', () => {
    cy.contains('Lighthouse').should('be.visible');
    cy.contains('Kafka operations console').should('be.visible');
    cy.contains('Cluster signals with a cleaner path to replay tooling.').should(
      'be.visible'
    );
  });

  it('renders primary navigation', () => {
    cy.get('nav[aria-label="Primary navigation"]').within(() => {
      cy.contains('Metrics').should('have.attr', 'href', '#metrics');
      cy.contains('Roadmap').should('have.attr', 'href', '#roadmap');
      cy.contains('GitHub').should('have.attr', 'href').and('include', 'github.com');
    });
  });

  it('shows Kafka metric panels', () => {
    cy.get('[aria-label="Kafka metrics"]').within(() => {
      cy.contains('Partition Count').should('be.visible');
      cy.contains('Broker Signal').should('be.visible');
      cy.contains('Log End Offset').should('be.visible');
      cy.contains('Metrics Exporter').should('be.visible');
    });
  });

  it('shows chart panels and roadmap', () => {
    cy.contains('Kafka Activity').should('be.visible');
    cy.contains('Topic Inventory').should('be.visible');
    cy.contains('Foundation first, replay engine next.').should('be.visible');
  });
});
