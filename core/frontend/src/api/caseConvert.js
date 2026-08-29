const toCamelKey = s => s.replace(/_([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
const toSnakeKey = s => s.replace(/[A-Z]/g, c => "_" + c.toLowerCase());

const isPlainObject = v => v !== null && typeof v === "object" && v.constructor === Object;

export const keysToCamel = obj => {
  if (Array.isArray(obj)) return obj.map(keysToCamel);
  if (isPlainObject(obj)) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toCamelKey(k), keysToCamel(v)]));
  }
  return obj;
};

export const keysToSnake = obj => {
  if (Array.isArray(obj)) return obj.map(keysToSnake);
  if (isPlainObject(obj)) {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [toSnakeKey(k), keysToSnake(v)]));
  }
  return obj;
};
