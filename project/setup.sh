#!/bin/bash
set -e

echo "🚀 Configuration de Cadastre_IA..."

# Client
if [ ! -f .env ]; then
  echo "📝 Création du fichier .env client..."
  cp .env.example .env
  echo "✅ .env créé - Modifier VITE_API_URL si nécessaire"
else
  echo "⚠️ .env existe déjà"
fi

# Server
if [ ! -f server/.env ]; then
  echo "📝 Création du fichier .env serveur..."
  cp server/.env.example server/.env
  # Générer JWT secret sécurisé
  if command -v node >/dev/null 2>&1; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    # Remplacer dans le fichier
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/CHANGE_ME_IN_PRODUCTION_USE_RANDOM_STRING/$JWT_SECRET/" server/.env
    else
      sed -i "s/CHANGE_ME_IN_PRODUCTION_USE_RANDOM_STRING/$JWT_SECRET/" server/.env
    fi
    echo "✅ server/.env créé avec JWT_SECRET sécurisé"
  else
    echo "⚠️ Node introuvable - veuillez mettre à jour JWT_SECRET manuellement dans server/.env"
  fi
else
  echo "⚠️ server/.env existe déjà"
fi

echo ""
echo "✅ Configuration terminée!"
echo ""
echo "📋 Prochaines étapes:"
echo " 1. cd server && npm install"
echo " 2. npm run dev (dans un terminal)"
echo " 3. cd .. && npm install (dans un autre terminal)"
echo " 4. npm run dev"
echo ""
