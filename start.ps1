# 货运雷达 · 一键启动（火山 DeepSeek + 高德 + SQLite）
# 用法：右键"用 PowerShell 运行"，或命令行  .\start.ps1
# 说明：用 node --env-file 读取 .env（key 固化在 .env，不会丢）；AI 助手走火山方舟 DeepSeek

Set-Location "D:\字研班\货车\货运雷达"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  🚛 货运雷达 · 启动中" -ForegroundColor Cyan
Write-Host "  AI 引擎:  🔴 火山方舟 DeepSeek" -ForegroundColor Green
Write-Host "  高德:     真实路线/天气/POI" -ForegroundColor Green
Write-Host "  数据:     SQLite 持久化" -ForegroundColor Green
Write-Host "  访问:     http://localhost:3000" -ForegroundColor Green
Write-Host "  手机(同WiFi):  http://<本机IP>:3000" -ForegroundColor Green
Write-Host "  查看IP:   ipconfig | findstr IPv4" -ForegroundColor Green
Write-Host "  =============================================" -ForegroundColor Cyan
Write-Host ""

npx tsx --env-file=.env src/server/index.ts
