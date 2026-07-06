export const db = {
  insert(): never {
    throw new Error('Database access is not available in the browser engine');
  },
  select(): never {
    throw new Error('Database access is not available in the browser engine');
  },
  update(): never {
    throw new Error('Database access is not available in the browser engine');
  },
  delete(): never {
    throw new Error('Database access is not available in the browser engine');
  },
};
