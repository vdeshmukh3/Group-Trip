import { initializeDatabase, pool } from "./db.js";

try {
  await initializeDatabase();
  console.log("Postgres tables are ready; any local Excel data was imported if present.");
} finally {
  await pool.end();
}
