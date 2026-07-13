#!/usr/bin/env pwsh

param(
  [switch]$SkipBuild,
  [Parameter(Mandatory = $true)]
  [string]$BackendOrigin,
  [Parameter(Mandatory = $true)]
  [string]$PublicOrigin,
  [string]$ConnectOrigin
)

$ErrorActionPreference = 'Stop'
$RootDir = Split-Path $PSScriptRoot
$Arguments = @("$PSScriptRoot/release.js", "--backend-origin=$BackendOrigin")

if ($SkipBuild) { $Arguments += '--skip-build' }
if ($PublicOrigin) { $Arguments += "--public-origin=$PublicOrigin" }
if ($ConnectOrigin) { $Arguments += "--connect-origin=$ConnectOrigin" }

Push-Location $RootDir
try {
  & node @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ChenDoc packaging failed." }
} finally {
  Pop-Location
}
