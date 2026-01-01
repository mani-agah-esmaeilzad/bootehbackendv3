const buildStringType = () => ({
  parse(value) {
    if (typeof value !== 'string') {
      throw new Error('Expected string');
    }
    return value;
  },
});

const object = (shape) => ({
  safeParse(data) {
    if (typeof data !== 'object' || data === null) {
      return { success: false, error: 'Invalid object' };
    }
    const result = {};
    for (const [key, schema] of Object.entries(shape)) {
      try {
        result[key] = schema.parse
          ? schema.parse(data[key])
          : data[key];
      } catch {
        return { success: false, error: `Invalid field: ${key}` };
      }
    }
    return { success: true, data: result };
  },
});

const api = {
  string: buildStringType,
  object,
};

module.exports = {
  ...api,
  z: api,
};
