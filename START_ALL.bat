@echo off
REM RepoHealth - double-click this file to start backend + frontend.
REM First run only: install backend deps and frontend deps once (see README).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_ALL.ps1"
pause
