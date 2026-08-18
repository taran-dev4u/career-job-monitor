param(
    [string]$TaskName = 'Career Job Monitor - Every 30 Minutes'
)

$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Output "Removed scheduled task: $TaskName"

