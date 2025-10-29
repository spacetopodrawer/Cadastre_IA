const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-bc';
const IV_LENGTH = 16;

function encrypt(text, key) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text, key) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

// Exemple d'utilisation
if (require.main === module) {
    const command = process.argv[2];
    const key = process.env.ENCRYPTION_KEY;
    
    if (!key) {
        console.error('ERREUR: La clé de chiffrement doit être définie dans la variable d\'environnement ENCRYPTION_KEY');
        process.exit(1);
    }

    if (command === 'encrypt') {
        const filePath = process.argv[3];
        if (!filePath) {
            console.error('Usage: node encrypt_credentials.js encrypt <fichier_credentials.json>');
            process.exit(1);
        }
        
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const encrypted = encrypt(data, key);
            const outputFile = filePath + '.enc';
            fs.writeFileSync(outputFile, encrypted);
            console.log(`Fichier chiffré enregistré sous: ${outputFile}`);
        } catch (err) {
            console.error('Erreur lors du chiffrement:', err);
        }
    } 
    else if (command === 'decrypt') {
        const filePath = process.argv[3];
        if (!filePath) {
            console.error('Usage: node encrypt_credentials.js decrypt <fichier_credentials.json.enc>');
            process.exit(1);
        }
        
        try {
            const encrypted = fs.readFileSync(filePath, 'utf8');
            const decrypted = decrypt(encrypted, key);
            console.log('Contenu déchiffré:');
            console.log(decrypted);
        } catch (err) {
            console.error('Erreur lors du déchiffrement:', err);
        }
    } else {
        console.log('Usage:');
        console.log('  Pour chiffrer: node encrypt_credentials.js encrypt <fichier_credentials.json>');
        console.log('  Pour déchiffrer: node encrypt_credentials.js decrypt <fichier_credentials.json.enc>');
        console.log('\nAssurez-vous de définir la variable d\'environnement ENCRYPTION_KEY');
    }
}

module.exports = { encrypt, decrypt };
