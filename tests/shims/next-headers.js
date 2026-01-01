const cookieStore = new Map();

const formatEntry = (name) => {
  const entry = cookieStore.get(name);
  if (!entry) return undefined;
  return { name, value: entry.value };
};

const api = {
  get(name) {
    return formatEntry(name);
  },
  getAll() {
    return Array.from(cookieStore.entries())
      .map(([name]) => formatEntry(name))
      .filter(Boolean);
  },
  set(name, value, _options) {
    cookieStore.set(name, { value });
  },
  delete(name) {
    cookieStore.delete(name);
  },
};

module.exports = {
  cookies() {
    return api;
  },
  __cookieStore: cookieStore,
};
