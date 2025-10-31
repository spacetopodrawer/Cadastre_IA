import { z } from 'zod';

/**
 * Types
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  synchronize: boolean;
}

export interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: string; // e.g. '1h'
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  database: DatabaseConfig;
  auth: AuthConfig;
  loggingLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Validation schema (Zod) pour les variables d'environnement
 * - Les noms suivent la convention `DB_*`, `JWT_*`, etc.
 * - Les valeurs sensibles (ex: JWT_SECRET) sont obligatoires en production
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Database
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('cadastre'),
  DB_USER: z.string().default('postgres'),
  DB_PASS: z.string().default(''),
  DB_SYNCHRONIZE: z.coerce.boolean().optional(),

  // Auth
  JWT_SECRET: z.string().min(1).optional(),
  JWT_EXPIRY: z.string().default('1h'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Charge et valide les variables d'environnement avec Zod.
 * Lance une erreur si une variable requise manque (selon l'environnement).
 */
export function buildBaseConfig(env = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  // En production, JWT_SECRET doit être présent
  if (parsed.NODE_ENV === 'production' && !parsed.JWT_SECRET) {
    throw new Error('JWT_SECRET must be defined in production environment');
  }

  // Fallbacks intelligents : en test on fournit des valeurs minimales si absentes
  const jwtSecretFallback =
    parsed.JWT_SECRET ?? (parsed.NODE_ENV === 'test' ? 'test-secret' : undefined);
  if (!jwtSecretFallback) {
    // En développement, on autorise un secret faible mais on logera une alerte
    if (parsed.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn('Warning: JWT_SECRET is not set. Using unsafe fallback.');
    }
  }

  const dbSyncFallback =
    typeof env.DB_SYNCHRONIZE !== 'undefined'
      ? Boolean(env.DB_SYNCHRONIZE === 'true' || env.DB_SYNCHRONIZE === true)
      : parsed.NODE_ENV === 'development';

  const cfg: AppConfig = {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    database: {
      host: parsed.DB_HOST,
      port: parsed.DB_PORT,
      database: parsed.DB_NAME,
      username: parsed.DB_USER,
      password: parsed.DB_PASS,
      synchronize: dbSyncFallback,
    },
    auth: {
      jwtSecret: jwtSecretFallback ?? '',
      tokenExpiry: parsed.JWT_EXPIRY,
    },
    loggingLevel: parsed.LOG_LEVEL,
  };

  return cfg;
}

/**
 * Helpers pour charger sous-parties si besoin (exemple dans la demande)
 */
export function loadDatabaseConfig(env = process.env): DatabaseConfig {
  return buildBaseConfig(env).database;
}

export function loadAuthConfig(env = process.env): AuthConfig {
  return buildBaseConfig(env).auth;
}
