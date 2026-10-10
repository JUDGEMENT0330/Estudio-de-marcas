import mysql from "mysql2/promise";
import { getMysqlConfig } from "@/lib/runtime";

/**
 * Pool de conexiones MySQL compartido (una instancia por proceso). En Vercel
 * cada función reutiliza el pool entre invocaciones "calientes"; el límite de
 * conexiones es bajo a propósito porque los planes compartidos de Hostinger
 * limitan las conexiones simultáneas por usuario.
 */
type PoolState = { pool: mysql.Pool; ready: Promise<void> };

const globalForMysql = globalThis as unknown as { __edmMysql?: PoolState };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS edm_users (
    id VARCHAR(64) PRIMARY KEY,
    auth_user_id VARCHAR(191) NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    name VARCHAR(255) NULL,
    plan VARCHAR(32) NOT NULL DEFAULT 'agency',
    stripe_customer_id VARCHAR(191) NULL,
    audit_credits_remaining INT NOT NULL DEFAULT 999999,
    scout_credits_remaining INT NOT NULL DEFAULT 999999,
    widget_api_key VARCHAR(191) NULL,
    white_label_config LONGTEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS edm_reports (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'queued',
    input LONGTEXT NOT NULL,
    result LONGTEXT NULL,
    scores LONGTEXT NULL,
    pdf_storage_path VARCHAR(512) NULL,
    email_sent_at VARCHAR(40) NULL,
    expires_at VARCHAR(40) NULL,
    is_widget_generated TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    INDEX idx_edm_reports_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS edm_api_usage (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    credits_consumed INT NOT NULL DEFAULT 1,
    stripe_metered_event_id VARCHAR(191) NULL,
    created_at VARCHAR(40) NOT NULL,
    metadata LONGTEXT NOT NULL,
    INDEX idx_edm_usage (user_id, action, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS edm_widget_leads (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    visitor_email VARCHAR(191) NOT NULL,
    visitor_name VARCHAR(255) NULL,
    business_audited VARCHAR(255) NOT NULL,
    report_id VARCHAR(64) NULL,
    created_at VARCHAR(40) NOT NULL,
    delivered_at VARCHAR(40) NULL,
    INDEX idx_edm_leads_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS edm_secrets (
    \`key\` VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(64) NOT NULL,
    label VARCHAR(191) NOT NULL,
    encrypted_value TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    last_tested_at VARCHAR(40) NULL,
    last_test_status VARCHAR(32) NULL,
    last_test_message TEXT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

function createState(): PoolState {
  const config = getMysqlConfig();
  if (!config) throw new Error("MySQL no está configurado.");
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    charset: "utf8mb4",
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 3),
    waitForConnections: true,
    connectTimeout: 10_000,
    enableKeepAlive: true,
  });
  const ready = (async () => {
    for (const statement of SCHEMA) await pool.query(statement);
  })();
  // Si la creación del esquema falla, permitir reintentar en la próxima llamada.
  ready.catch(() => {
    if (globalForMysql.__edmMysql?.pool === pool) globalForMysql.__edmMysql = undefined;
    void pool.end().catch(() => undefined);
  });
  return { pool, ready };
}

export async function getMysqlPool(): Promise<mysql.Pool> {
  if (!globalForMysql.__edmMysql) globalForMysql.__edmMysql = createState();
  const state = globalForMysql.__edmMysql;
  await state.ready;
  return state.pool;
}

export async function closeMysqlPool(): Promise<void> {
  const state = globalForMysql.__edmMysql;
  globalForMysql.__edmMysql = undefined;
  if (state) await state.pool.end().catch(() => undefined);
}
