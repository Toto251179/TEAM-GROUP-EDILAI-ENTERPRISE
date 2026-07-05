import { query } from "../config/db.js";

function toCamel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value,
    ]),
  );
}

function toSnake(field) {
  return field.replace(/[A-Z]/g, (letter) => "_" + letter.toLowerCase());
}

export function createCrudRepository({ table, allowedFields, defaultOrder = "created_at DESC" }) {
  return {
    async findAll() {
      const result = await query(`SELECT * FROM ${table} ORDER BY ${defaultOrder}`);
      return result.rows.map(toCamel);
    },

    async findById(id) {
      const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
      return result.rows[0] ? toCamel(result.rows[0]) : null;
    },

    async create(data) {
      const fields = Object.keys(data).filter((field) => allowedFields.includes(field));
      if (fields.length === 0) throw new Error("Nessun campo valido da salvare.");

      const columns = fields.map(toSnake);
      const values = fields.map((field) => data[field]);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

      const result = await query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
        values,
      );

      return toCamel(result.rows[0]);
    },

    async update(id, data) {
      const fields = Object.keys(data).filter((field) => allowedFields.includes(field));
      if (fields.length === 0) return this.findById(id);

      const values = fields.map((field) => data[field]);
      const assignments = fields.map((field, index) => `${toSnake(field)} = $${index + 2}`);
      assignments.push("updated_at = NOW()");

      const result = await query(
        `UPDATE ${table} SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
        [id, ...values],
      );

      return result.rows[0] ? toCamel(result.rows[0]) : null;
    },

    async remove(id) {
      const result = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
      return result.rows[0] ? toCamel(result.rows[0]) : null;
    },
  };
}
