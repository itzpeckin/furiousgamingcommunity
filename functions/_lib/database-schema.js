export const REQUIRED_DATABASE_VERSION = 30;

const checks = new WeakMap();

export class DatabaseSchemaError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DatabaseSchemaError';
    this.code = 'DATABASE_MIGRATION_REQUIRED';
    this.requiredVersion = REQUIRED_DATABASE_VERSION;
    this.currentVersion = details.currentVersion ?? null;
    this.cause = details.cause;
  }
}

async function inspectDatabaseVersion(db) {
  try {
    const row = await db.prepare(
      'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT 1'
    ).first();
    return {
      version: Number(row?.version || 0),
      name: row?.name ? String(row.name) : null
    };
  } catch (cause) {
    throw new DatabaseSchemaError(
      'FranchiseHQ database migrations have not been applied.',
      { currentVersion: 0, cause }
    );
  }
}

export async function requireDatabaseSchema(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new DatabaseSchemaError('FranchiseHQ database binding is unavailable.');
  }

  let pending = checks.get(db);
  if (!pending) {
    pending = inspectDatabaseVersion(db);
    checks.set(db, pending);
  }

  let current;
  try {
    current = await pending;
  } catch (error) {
    if (checks.get(db) === pending) checks.delete(db);
    throw error;
  }
  if (current.version < REQUIRED_DATABASE_VERSION) {
    if (checks.get(db) === pending) checks.delete(db);
    throw new DatabaseSchemaError(
      `FranchiseHQ database migration ${REQUIRED_DATABASE_VERSION} is required; current version is ${current.version}.`,
      { currentVersion: current.version }
    );
  }
  return current;
}
