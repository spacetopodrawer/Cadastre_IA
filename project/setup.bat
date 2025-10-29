@echo off
echo 🚀 Configuration de Cadastre_IA...
echo.

REM Client
if not exist .env (
  echo 📝 Création du fichier .env client...
  copy .env.example .env >nul
  echo ✅ .env créé - Modifier VITE_API_URL si nécessaire
) else (
  echo ⚠️ .env existe déjà
)

REM Server
if not exist server\.env (
  echo 📝 Création du fichier .env serveur...
  copy server\.env.example server\.env >nul
  echo ✅ server\.env créé
  echo ⚠️ IMPORTANT: Changez JWT_SECRET dans server\.env
) else (
  echo ⚠️ server\.env existe déjà
)

echo.
echo ✅ Configuration terminée!
echo.
echo 📋 Prochaines étapes:
echo 1. cd server ^&^& npm install
echo 2. npm run dev (dans un terminal)
echo 3. cd .. ^&^& npm install (dans un autre terminal)
echo 4. npm run dev
echo.
pause
