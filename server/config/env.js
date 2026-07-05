import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3001),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "team_group_edilai",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "LA_PASSWORD_CHE_HAI_SCELTO",
  },
};
