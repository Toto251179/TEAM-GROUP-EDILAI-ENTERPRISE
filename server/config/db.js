import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool(env.db);

export async function query(text, params = []) {
  return pool.query(text, params);
}
