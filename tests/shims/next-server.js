const buildJsonResponse = (body, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers,
  });
};

class NextResponse extends Response {
  static json(body, init) {
    return buildJsonResponse(body, init);
  }
}

const NextRequest = Request;

module.exports = {
  NextResponse,
  NextRequest,
};
