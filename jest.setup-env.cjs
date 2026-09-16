/**
 * CI/unit tests often have no app .env. Avoid accidental eager ConfigModule
 * validation failures when modules under @app/database are imported.
 */
process.env.DATABASE_PORT ??= '3306';
process.env.DATABASE_SERVER ??= '127.0.0.1';
process.env.DATABASE_USERNAME ??= 'test';
process.env.DATABASE_PASSWORD ??= 'test';
process.env.DATABASE_NAME ??= 'test';
process.env.DB_FIELD_ENCRYPTION_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
