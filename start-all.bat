@echo off
echo ===================================================
echo   Starting Conexus Platform (Backend + Frontend)
echo ===================================================
echo.

echo Starting Spring Boot Backend (Port 8080)...
start "Conexus Backend" cmd /k "cd /d %~dp0backend && mvnw.cmd spring-boot:run"

echo Starting Frontend (Port 5500)...
start "Conexus Frontend" cmd /k "cd /d %~dp0 && npm start"

echo.
echo ===================================================
echo   Both services launched in separate windows!
echo   - Backend:  http://localhost:8080
echo   - Frontend: http://localhost:5500
echo ===================================================
pause
