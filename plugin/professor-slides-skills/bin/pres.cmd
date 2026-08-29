@echo off
rem The `pres` CLI for Windows shells that are not Git Bash.
rem See the sibling `pres` script for the reasoning.

setlocal
set "ENTRY=%~dp0..\node\bin\pres.ts"

if not "%PRES_NODE%"=="" (
    "%PRES_NODE%" --experimental-strip-types --no-warnings "%ENTRY%" %*
    exit /b %errorlevel%
)

where node >nul 2>&1 && (
    node --experimental-strip-types --no-warnings "%ENTRY%" %*
    exit /b %errorlevel%
)

1>&2 echo pres: no Node on PATH.
1>&2 echo This plugin runs TypeScript directly, which needs Node 22.6 or later.
1>&2 echo Install a current Node, or set PRES_NODE to one.
exit /b 127
