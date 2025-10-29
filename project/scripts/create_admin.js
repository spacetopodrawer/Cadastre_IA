const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { decrypt } = require('./encrypt_credentials');

async function createAdmin() {
    try {
        // Vérifier la clé de chiffrement
        const encryptionKey = process.env.ENCRYPTION_KEY;
        if (!encryptionKey) {
            console.error('ERREUR: La clé de chiffrement doit être définie dans la variable d\'environnement ENCRYPTION_KEY');
            process.exit(1);
        }

        // Vérifier si le fichier chiffré existe
        const encryptedFile = path.join(process.cwd(), 'credentials.json.enc');
        if (!fs.existsSync(encryptedFile)) {
            console.error('ERREUR: Fichier credentials.json.enc introuvable');
            console.log('Exécutez d\'abord: node scripts/encrypt_credentials.js encrypt credentials.json');
            process.exit(1);
        }

        // Lire et déchiffrer les identifiants
        const encryptedData = fs.readFileSync(encryptedFile, 'utf8');
        const credentials = JSON.parse(decrypt(encryptedData, encryptionKey));
        
        // Créer l'administrateur via l'API
        const { admin, api } = credentials;
        const url = `${api.url}${api.endpoints.createAdmin}`;
        
        console.log('Création du compte administrateur...');
        const response = await axios.post(url, admin);
        
        console.log('✅ Compte administrateur créé avec succès!');
        console.log(`Email: ${admin.email}`);
        console.log('Note: Conservez ces informations en lieu sûr.');
        
    } catch (error) {
        console.error('ERREUR lors de la création de l\'administrateur:');
        if (error.response) {
            console.error('Détails:', error.response.data);
        } else {
            console.error(error.message);
        }
        process.exit(1);
    }
}

// Exécuter le script
createAdmin();
