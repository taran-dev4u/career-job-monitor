$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BundledNode = 'C:\Users\mamid\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

if (-not (Test-Path -LiteralPath $BundledNode)) {
    throw "Codex bundled Node.js was not found at $BundledNode"
}

Set-Location -LiteralPath $ProjectRoot
& $BundledNode (Join-Path $ProjectRoot 'src\monitor.mjs') --once *>> (Join-Path $ProjectRoot 'monitor.log')
exit $LASTEXITCODE

