#!/usr/bin/env pwsh
# ChenDoc 发布打包脚本
# 生成两份压缩包：公共包(不含内部文档) + 服务器包(含内部排查文档)
# 用法: pwsh ./scripts/release.ps1 [-SkipBuild] [-SkipGit] [-SkipRelease]

param(
  [switch]$SkipBuild,
  [switch]$SkipGit,
  [switch]$SkipRelease
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 强制 LF 换行
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

$RootDir = $PSScriptRoot | Split-Path
Set-Location $RootDir

Write-Host "=== ChenDoc 发布打包 ===" -ForegroundColor Cyan
Write-Host "工作目录: $RootDir"

# 读取版本
$version = node -p "require('./package.json').version"
if (-not $version) { throw "无法读取版本号" }
Write-Host "当前版本: $version" -ForegroundColor Green

$publicZip = "release/chendoc-$version-public.zip"
$serverZip = "release/chendoc-$version-server.zip"

# 创建 release 目录
if (-not (Test-Path "release")) { New-Item -ItemType Directory -Path "release" | Out-Null }

# ========== 1. 构建 ==========
if (-not $SkipBuild) {
  Write-Host "`n[1/5] 执行构建..." -ForegroundColor Yellow

  # 依赖安装
  Write-Host "  安装依赖..."
  npm ci --workspaces --include-workspace-root 2>&1 | Out-Null

  # 构建
  Write-Host "  构建前后端..."
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "构建失败" }

  Write-Host "  构建完成" -ForegroundColor Green
} else {
  Write-Host "`n[1/5] 跳过构建" -ForegroundColor Gray
}

# ========== 2. 准备打包目录 ==========
Write-Host "`n[2/5] 准备打包..." -ForegroundColor Yellow

$tmpDir = ".tmp/release-$version"
$publicTmp = "$tmpDir/public-pkg"
$serverTmp = "$tmpDir/server-pkg"

# 清理旧临时目录
if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
New-Item -ItemType Directory -Path $publicTmp | Out-Null
New-Item -ItemType Directory -Path $serverTmp | Out-Null

# 需要排除的路径模式 (相对路径)
$excludePatterns = @(
  ".git",
  "node_modules",
  "apps/admin/node_modules",
  "server/node_modules",
  "data",
  ".env",
  ".env.local",
  ".env.*.local",
  ".tmp",
  "backups",
  "logs",
  "*.log",
  "*.sqlite",
  "*.sqlite-shm",
  "*.sqlite-wal"
)

# 公共包额外排除 (内部文档和敏感文件)
$publicOnlyExclude = @(
  "docs",
  "超记忆副本.md",
  "更改必读规范.md",
  "优化建议.md",
  "安全审计.md",
  "开发者-分析报告.md",
  "用户-分析报告.md",
  "FILE_GUIDE.md"
)

# 获取所有文件
Write-Host "  扫描源文件..."
$allFiles = Get-ChildItem -Path . -Recurse -File -Depth 20 | Where-Object {
  $_.FullName -notmatch '\\\.git\\' -and
  $_.FullName -notmatch '\\node_modules\\' -and
  $_.FullName -notmatch '\\\.tmp\\'
} | ForEach-Object {
  $relPath = $_.FullName.Substring((Get-Location).Path.Length + 1).Replace('\', '/')
  [PSCustomObject]@{
    SourcePath = $_.FullName
    RelativePath = $relPath
  }
}

# 过滤函数
function Test-ShouldExclude {
  param([string]$RelPath, [bool]$IsPublicOnly)

  foreach ($pattern in $excludePatterns) {
    if ($RelPath -eq $pattern -or $RelPath -like "*$pattern*") {
      return $true
    }
  }

  if ($IsPublicOnly) {
    foreach ($pattern in $publicOnlyExclude) {
      if ($RelPath -eq $pattern -or $RelPath -like "*$pattern*") {
        return $true
      }
    }
  }

  return $false
}

# 复制文件到公共包
Write-Host "  打包公共包..."
$publicCount = 0
foreach ($file in $allFiles) {
  if (Test-ShouldExclude $file.RelativePath $true) { continue }

  $destDir = Join-Path $publicTmp (Split-Path $file.RelativePath)
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item $file.SourcePath (Join-Path $publicTmp $file.RelativePath) -Force
  $publicCount++
}
Write-Host "    公共包: $publicCount 文件" -ForegroundColor Gray

# 复制文件到服务器包
Write-Host "  打包服务器包..."
$serverCount = 0
foreach ($file in $allFiles) {
  if (Test-ShouldExclude $file.RelativePath $false) { continue }

  $destDir = Join-Path $serverTmp (Split-Path $file.RelativePath)
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item $file.SourcePath (Join-Path $serverTmp $file.RelativePath) -Force
  $serverCount++
}
Write-Host "    服务器包: $serverCount 文件" -ForegroundColor Gray

# 清理公共包内的空目录
Get-ChildItem $publicTmp -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
  if ((Get-ChildItem $_.FullName -Force | Measure-Object).Count -eq 0) {
    Remove-Item $_.FullName -Force
  }
}

# 清理服务器包内的空目录
Get-ChildItem $serverTmp -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
  if ((Get-ChildItem $_.FullName -Force | Measure-Object).Count -eq 0) {
    Remove-Item $_.FullName -Force
  }
}

# ========== 3. 生成压缩包 ==========
Write-Host "`n[3/5] 生成压缩包..." -ForegroundColor Yellow

# 使用 dotnet 或 7z 压缩 (优先用 dotnet)
$useZip = $true

# 公共包
if (Test-Path $publicZip) { Remove-Item $publicZip -Force }
try {
  Compress-Archive -Path "$publicTmp\*" -DestinationPath $publicZip -CompressionLevel Optimal
  Write-Host "  公共包: $publicZip" -ForegroundColor Green
} catch {
  Write-Host "  dotnet Compress-Archive 失败，尝试 7z..." -ForegroundColor Yellow
  & 7z a -tzip "$publicZip" "$publicTmp\*" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  公共包: $publicZip (7z)" -ForegroundColor Green
  } else {
    throw "压缩失败"
  }
}

# 服务器包
if (Test-Path $serverZip) { Remove-Item $serverZip -Force }
try {
  Compress-Archive -Path "$serverTmp\*" -DestinationPath $serverZip -CompressionLevel Optimal
  Write-Host "  服务器包: $serverZip" -ForegroundColor Green
} catch {
  Write-Host "  dotnet Compress-Archive 失败，尝试 7z..." -ForegroundColor Yellow
  & 7z a -tzip "$serverZip" "$serverTmp\*" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  服务器包: $serverZip (7z)" -ForegroundColor Green
  } else {
    throw "压缩失败"
  }
}

# 计算 SHA256
Write-Host "`n  SHA-256 校验:" -ForegroundColor Gray
Write-Host "  公共包:" -ForegroundColor Gray
$publicSha = (Get-FileHash $publicZip -Algorithm SHA256).Hash
Write-Host "    $publicSha" -ForegroundColor Gray
Write-Host "  服务器包:" -ForegroundColor Gray
$serverSha = (Get-FileHash $serverZip -Algorithm SHA256).Hash
Write-Host "    $serverSha" -ForegroundColor Gray

# 清理临时目录
Remove-Item -Recurse -Force $tmpDir

# ========== 4. Git 提交 ==========
if (-not $SkipGit) {
  Write-Host "`n[4/5] Git 提交..." -ForegroundColor Yellow

  # 检查是否有变更
  $status = git status --porcelain
  if ($status) {
    Write-Host "  有未提交变更，先暂存..." -ForegroundColor Yellow
    git add -A
    git status --short
  }

  # 检查是否需要提交
  $latestCommit = git log -1 --format=%s
  $expectedMsg = "Release ChenDoc v$version"

  if ($latestCommit -eq $expectedMsg) {
    Write-Host "  版本 $version 已提交，跳过" -ForegroundColor Gray
  } else {
    # 创建 tag 并提交
    git checkout -B release/$version 2>$null
    git add -A
    git commit -m $expectedMsg
    git tag "v$version"

    Write-Host "  已提交并创建 tag v$version" -ForegroundColor Green

    # 推送到 GitHub
    Write-Host "  推送到 GitHub..."
    git push origin "release/$version" --tags
    Write-Host "  推送完成" -ForegroundColor Green
  }
} else {
  Write-Host "`n[4/5] 跳过 Git" -ForegroundColor Gray
}

# ========== 5. 创建 GitHub Release ==========
if (-not $SkipRelease) {
  Write-Host "`n[5/5] 创建 GitHub Release..." -ForegroundColor Yellow

  # 检查 gh CLI
  $ghAvailable = $null -ne (Get-Command gh -ErrorAction SilentlyContinue)
  if (-not $ghAvailable) {
    Write-Host "  gh CLI 不可用，跳过 Release 创建" -ForegroundColor Yellow
    Write-Host "  请手动在 GitHub 创建 Release 或等 CI 自动触发" -ForegroundColor Yellow
  } else {
    # 检查是否已存在
    $existing = gh release view "v$version" 2>$null
    if ($existing) {
      Write-Host "  Release v$version 已存在" -ForegroundColor Gray
    } else {
      # 生成发布说明
      $changelog = Get-Content CHANGELOG.md -Raw -Encoding UTF8
      $marker = "### $version"
      $start = $changelog.IndexOf($marker)
      if ($start -ge 0) {
        $rest = $changelog.Substring($start + $marker.Length)
        $end = $rest.IndexOf("`n###")
        if ($end -gt 0) {
          $body = $rest.Substring(0, $end).Trim()
        } else {
          $body = $rest.Trim()
        }

        # 创建 Release
        $notesFile = "$tmpDir/release-notes.md"
        "@# ChenDoc v$version`n`n$body" | Out-File -FilePath $notesFile -Encoding UTF8

        gh release create "v$version" `
          --title "ChenDoc v$version" `
          --notes-file $notesFile `
          --target HEAD

        # 上传压缩包
        Write-Host "  上传公共包..."
        gh release upload "v$version" $publicZip --clobber

        Write-Host "  上传服务器包..."
        gh release upload "v$version" $serverZip --clobber

        Write-Host "  Release 创建完成: https://github.com/cxiao4128/chendoc/releases/tag/v$version" -ForegroundColor Green
      } else {
        Write-Host "  找不到 CHANGELOG.md 中 $version 的内容" -ForegroundColor Red
      }
    }
  }
} else {
  Write-Host "`n[5/5] 跳过 Release" -ForegroundColor Gray
}

# ========== 完成 ==========
Write-Host "`n=== 打包完成 ===" -ForegroundColor Cyan
Write-Host "公共包: $publicZip"
Write-Host "服务器包: $serverZip"
Write-Host ""
Write-Host "验证命令:"
Write-Host "  解压到临时目录检查: Expand-Archive $publicZip -DestinationPath .tmp/verify-public"
Write-Host "  检查根目录结构: Get-ChildItem .tmp/verify-public -Depth 1"
