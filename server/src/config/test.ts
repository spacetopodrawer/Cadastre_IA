import { buildBaseConfig } from './default';

/**
 * Test configuration: valeurs sûres et isolées
 */
const cfg = buildBaseConfig({
  ...process.env,
  NODE_ENV: 'test',
  DB_NAME: process.env.DB_NAME ?? 'cadastre_test',
  DB_USER: process.env.DB_USER ?? 'test',
  DB_PASS: process.env.DB_PASS ?? 'test',
  JWT_SECRET: process.env.JWT_SECRET ?? 'test-secret',
});

export const config = {
  ...cfg,
  loggingLevel: 'error' as const,
} as const;

export default config;
