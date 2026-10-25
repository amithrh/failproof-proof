// Minimal stand-in for a SQL client.
export const db = { query: async (sql) => (console.log("SQL:", sql), []) };
