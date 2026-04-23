import handler from '../pages/api/health';

function createResponse() {
  return {
    json: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(function setStatus() {
      return this;
    }),
  };
}

describe('/api/health', () => {
  it('returns a minimal health payload', () => {
    const response = createResponse();

    handler({ method: 'GET' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      service: 'lighthouse',
      status: 'ok',
    });
  });

  it('rejects non-GET requests', () => {
    const response = createResponse();

    handler({ method: 'POST' }, response);

    expect(response.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(response.status).toHaveBeenCalledWith(405);
    expect(response.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });
});
