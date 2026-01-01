const store = new Map();
let counter = 0;

const nowSeconds = () => Math.floor(Date.now() / 1000);

module.exports = {
  sign(payload, _secret, options = {}) {
    const token = `mock-token-${counter++}`;
    const expiresIn =
      typeof options.expiresIn === 'number'
        ? options.expiresIn
        : typeof options.expiresIn === 'string'
          ? parseInt(options.expiresIn, 10) || 0
          : 0;
    const iat = nowSeconds();
    const exp = expiresIn > 0 ? iat + expiresIn : undefined;

    store.set(token, {
      ...payload,
      ...(exp ? { exp } : {}),
      iat,
    });
    return token;
  },
  verify(token) {
    const payload = store.get(token);
    if (!payload) {
      throw new Error('Invalid token');
    }
    if (payload.exp && payload.exp < nowSeconds()) {
      throw new Error('Token expired');
    }
    return payload;
  },
  __reset() {
    store.clear();
    counter = 0;
  },
};
