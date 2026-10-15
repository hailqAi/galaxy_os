@echo off
rem Copy beside the pinned portable Node and chrome-mcp directories under LOCALAPPDATA/GalaxyOS/Tools.
set "CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS=1"
set "CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1"
cd /d "%~dp0"
"%~dp0node-v22.23.3-win-x64\node.exe" "%~dp0chrome-mcp\node_modules\chrome-devtools-mcp\build\src\bin\chrome-devtools-mcp.js" --browser-url=http://127.0.0.1:33004 --no-usage-statistics --no-performance-crux --redact-network-headers --allowed-url-pattern=https://localhost:33003/* --allowed-url-pattern=http://localhost:3000/*
