import path from 'path';
import dotenv from 'dotenv';

// Charge .env par défaut depuis la racine du dossier server
const envPath = path.resolve(__dirname, '../../.env');
const envLocalPath = path.resolve(__dirname, '../../.env.local');

// Charger .env.local puis .env pour permettre des overrides locaux
dotenv.config({ path: envPath });
dotenv.config({ path: envLocalPath });

const NODE_ENV = process.env.NODE_ENV ?? 'development';

let configModule;
try {
  // Charge le fichier correspondant à l'environnement
  // Remarque: on utilise require dynamique pour permettre le hot-reload en dev
  switch (NODE_ENV) {
    case 'production':
      configModule = require('./production');
      break;
    case 'test':
      configModule = require('./test');
      break;
    case 'development':
    default:
      configModule = require('./development');
  }
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('Failed to load config for env', NODE_ENV, err);
  throw err;
}

// Exporter la config. En développement, on supporte le rechargement à chaud en retournant
// une fonction qui relit le module à chaque appel si nécessaire.
if (NODE_ENV === 'development') {
  module.exports.getConfig = () => {
    // Bust the require cache for hot reload
    delete require.cache[require.resolve('./development')];
    // eslint-disable-next-line global-require
    return require('./development').config;
  };
} else {
  module.exports = configModule;
}

export {}; // TS module augmentation
