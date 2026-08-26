@REM ============================================================
@REM  Maven Wrapper for Conexus Backend
@REM  Points to the Maven installation downloaded to %TEMP%\maven
@REM  Run: .\mvnw.cmd spring-boot:run
@REM ============================================================
@ECHO OFF

SET "MVN=%TEMP%\maven\apache-maven-3.9.6\bin\mvn.cmd"

IF NOT EXIST "%MVN%" (
    ECHO Maven not found at %MVN%.
    ECHO Please run the following in PowerShell to download it:
    ECHO   Invoke-WebRequest -Uri "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.6/apache-maven-3.9.6-bin.zip" -OutFile "$env:TEMP\maven.zip"; Expand-Archive -Path "$env:TEMP\maven.zip" -DestinationPath "$env:TEMP\maven" -Force
    EXIT /B 1
)

CALL "%MVN%" %*
