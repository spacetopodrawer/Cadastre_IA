import { buildBaseConfig } from './default';

/**
 * Production config - stricte
 */
const cfg = buildBaseConfig(process.env);

export const config = {
  ...cfg,
  // En production on s'assure que synchronize est false par défaut
  database: {
    ...cfg.database,
    synchronize: cfg.database.synchronize && false,
  },
} as const;

export default config;
