@echo off
echo ===================================================
echo   Starting Conexus Platform (Backend + Frontend)
echo ===================================================
echo.

echo Starting Spring Boot Backend (Port 8080)...
start "Conexus Backend" cmd /k "cd /d %~dp0backend && mvnw.cmd spring-boot:run"

echo Starting Angular Frontend (Port 4200)...
start "Conexus Frontend" cmd /k "cd /d %~dp0 && npm start"

echo.
echo ===================================================
echo   Both services launched in separate windows!
echo   - Backend:  http://localhost:8080
echo   - Frontend: http://localhost:4200
echo ===================================================
pause
