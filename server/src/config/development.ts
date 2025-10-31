import { buildBaseConfig } from './default';

/**
 * Variables spécifiques au développement
 * On peut surcharger certaines valeurs si nécessaire
 */
export const config = {
  // ...existing code...
  // Utilise les valeurs par défaut mais force quelques comportements dev
  ...buildBaseConfig(process.env),
  loggingLevel: 'debug' as const,
};

export default config;
