#requires -Version 5.1
<#
  货运雷达 · 公网演示一键启动（0 元方案）

  双击 `start-public.cmd` 即可（或右键本文件「使用 PowerShell 运行」）。

  它做三件事：
    1. 起本地服务（端口 3000，读 .env 里的 DeepSeek / 高德 key）
    2. 起 Cloudflare 临时隧道，拿到一个 https://xxx.trycloudflare.com 链接
    3. 把链接打印出来并复制到剪贴板，直接粘给面试官

  什么时候用：**面试前 10 分钟双击**，面试结束按 Ctrl+C 关掉。
  注意：关掉窗口 / 电脑睡眠 → 链接立刻失效。子域名每次启动都会变，每次都要重新发。
#>

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$Port = 3000
$ServerLog = Join-Path $env:TEMP 'freight-radar-server.log'
$ServerErr = Join-Path $env:TEMP 'freight-radar-server.err.log'
$TunnelLog = Join-Path $env:TEMP 'freight-radar-tunnel.log'
$TunnelErr = Join-Path $env:TEMP 'freight-radar-tunnel.err.log'

function Write-Step($msg) { Write-Host "[$msg]" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  $msg" -ForegroundColor Green }
function Write-Bad($msg)  { Write-Host "  $msg" -ForegroundColor Red }

Write-Host ''
Write-Host '=============================================' -ForegroundColor DarkCyan
Write-Host '  货运雷达 · 公网演示（临时链接，0 元）' -ForegroundColor White
Write-Host '=============================================' -ForegroundColor DarkCyan

# ---------- 0. 找 cloudflared ----------
$cf = @(
  'C:\Program Files (x86)\cloudflared\cloudflared.exe',
  (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $cf) {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { $cf = $cmd.Source }
}
if (-not $cf) {
  Write-Bad '没找到 cloudflared，先装一次（只需一次）：'
  Write-Host '     winget install Cloudflare.cloudflared' -ForegroundColor Yellow
  exit 1
}

# ---------- 1. 起服务（已开着就复用） ----------
$serverProc = $null
$alreadyUp = $false
try { Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null; $alreadyUp = $true } catch { }

if ($alreadyUp) {
  Write-Step '1/3 本地服务已在运行，直接复用'
  Write-Ok "http://localhost:$Port"
} else {
  Write-Step '1/3 启动本地服务（约 3-8 秒）'
  Remove-Item $ServerLog, $ServerErr -ErrorAction SilentlyContinue
  $serverProc = Start-Process -FilePath 'npx.cmd' `
    -ArgumentList 'tsx', '--env-file=.env', 'src/server/index.ts' `
    -WorkingDirectory $PSScriptRoot -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $ServerLog -RedirectStandardError $ServerErr

  $up = $false
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Milliseconds 800
    try { Invoke-RestMethod "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null; $up = $true; break } catch { }
    if ($serverProc.HasExited) { break }
  }
  if (-not $up) {
    Write-Bad '服务没起来。日志：'
    $ServerErr, $ServerLog | Where-Object { Test-Path $_ } | ForEach-Object {
      Write-Host "----- $_ -----" -ForegroundColor DarkGray
      Get-Content $_ -Tail 25 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
    }
    if ($serverProc -and -not $serverProc.HasExited) { Stop-Process -Id $serverProc.Id -Force }
    exit 1
  }
  Write-Ok "http://localhost:$Port 已就绪"
}

# ---------- 2. 起隧道 ----------
Write-Step '2/3 建立公网隧道'
Remove-Item $TunnelLog, $TunnelErr -ErrorAction SilentlyContinue
$tunnelProc = Start-Process -FilePath $cf `
  -ArgumentList 'tunnel', '--url', "http://localhost:$Port", '--no-autoupdate' `
  -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErr

$publicUrl = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 800
  foreach ($f in @($TunnelErr, $TunnelLog)) {
    if (Test-Path $f) {
      $m = Select-String -Path $f -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue |
           Select-Object -First 1
      if ($m) { $publicUrl = $m.Matches[0].Value; break }
    }
  }
  if ($publicUrl) { break }
  if ($tunnelProc.HasExited) { break }
}

if (-not $publicUrl) {
  Write-Bad '隧道没建起来（多半是网络/防火墙拦了 QUIC）。日志：'
  Get-Content $TunnelErr -Tail 20 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ -ForegroundColor DarkGray }
  if ($tunnelProc -and -not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force }
  if ($serverProc -and -not $serverProc.HasExited) { Stop-Process -Id $serverProc.Id -Force }
  exit 1
}

# ---------- 3. 先给链接，再自检 ----------
try { Set-Clipboard -Value $publicUrl } catch { }

Write-Host ''
Write-Host '=============================================' -ForegroundColor Green
Write-Host '  链接已就绪（已复制到剪贴板）' -ForegroundColor White
Write-Host ''
Write-Host "  $publicUrl" -ForegroundColor Yellow
Write-Host ''
Write-Host '  发给面试官时加一句：' -ForegroundColor Gray
Write-Host '  「演示环境，建议用手机/电脑浏览器直接打开，微信内置浏览器可能拦截」' -ForegroundColor Gray
Write-Host '=============================================' -ForegroundColor Green
Write-Host ''
Write-Step '正在从公网侧自检（新域名通常要 30-60 秒才全球生效，不用急）'
$healthy = $false
for ($i = 0; $i -lt 90; $i++) {
  try { Invoke-WebRequest "$publicUrl/api/health" -TimeoutSec 8 -UseBasicParsing | Out-Null; $healthy = $true; break } catch { Start-Sleep -Seconds 2 }
}
if ($healthy) {
  Write-Ok '公网自检通过：外部已经能打开这个链接'
} else {
  Write-Bad '自检尚未通过：再等 1-2 分钟刷新；仍打不开就 Ctrl+C 后重跑一次'
}
Write-Host ''
Write-Host '  按 Ctrl+C 结束（结束后链接立即失效）' -ForegroundColor DarkGray
Write-Host ''

# ---------- 保活：隧道空闲不会被踢，这里只保持进程 ----------
try {
  while ($true) {
    Start-Sleep -Seconds 30
    if ($tunnelProc.HasExited) {
      Write-Host ''
      Write-Bad '隧道已断开（网络波动？），重新运行本脚本即可拿到新链接'
      break
    }
  }
} finally {
  Write-Host ''
  Write-Host '正在关闭...' -ForegroundColor DarkGray
  if ($tunnelProc -and -not $tunnelProc.HasExited) { Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue }
  if ($serverProc -and -not $serverProc.HasExited) { Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue }
  Write-Host '已关闭。' -ForegroundColor DarkGray
}
