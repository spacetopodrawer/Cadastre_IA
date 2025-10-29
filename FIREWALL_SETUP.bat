@echo off
echo ╔══════════════════════════════════════════╗
echo ║ Configuration Firewall Cadastre_IA ║
echo ╚══════════════════════════════════════════╝
echo.
echo ATTENTION: Executer en tant qu'Administrateur!
echo.
pause

netsh advfirewall firewall add rule name="Cadastre_IA Backend" dir=in action=allow protocol=TCP localport=5000
netsh advfirewall firewall add rule name="Cadastre_IA Frontend" dir=in action=allow protocol=TCP localport=5173

echo.
echo ═══════════════════════════════════════════
echo Verification des regles creees:
echo ═══════════════════════════════════════════
netsh advfirewall firewall show rule name="Cadastre_IA Backend"
netsh advfirewall firewall show rule name="Cadastre_IA Frontend"

echo.
echo ✅ Configuration terminee!
pause
