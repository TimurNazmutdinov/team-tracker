@echo off
chcp 65001 >nul
cd /d "%~dp0"
title team-tracker

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js LTS с https://nodejs.org и запустите файл снова.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости, это займёт пару минут...
  call npm install
  if errorlevel 1 (
    echo Не удалось установить зависимости.
    pause
    exit /b 1
  )
)

if not exist .env copy .env.example .env >nul

echo Запускаю трекер. Это окно не закрывайте: пока оно открыто, трекер работает.
call npm run start -- --open

echo.
echo Трекер остановлен.
pause
