param([string]$Phase = "record")

$baseUrl = "http://localhost:3001"
$dataFile = Join-Path $PSScriptRoot "persistence_data.json"

function Send-ApiRequest {
    param(
        [string]$Method,
        [string]$Path,
        [string]$Token = $null,
        [hashtable]$Body = $null
    )
    
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    if ($Method -eq "POST" -or $Method -eq "PUT") { $headers["Content-Type"] = "application/json" }
    
    $url = "$baseUrl$Path"
    $bodyJson = if ($Body) { $Body | ConvertTo-Json -Depth 10 } else { $null }
    
    try {
        if ($bodyJson) {
            $resp = Invoke-WebRequest -Uri $url -Method $Method -Headers $headers -Body $bodyJson -UseBasicParsing
        } else {
            $resp = Invoke-WebRequest -Uri $url -Method $Method -Headers $headers -UseBasicParsing
        }
        $contentType = $resp.Headers["Content-Type"]
        if ($contentType -like "*application/json*") {
            $content = $resp.Content | ConvertFrom-Json
            return @{ Success = $true; Data = $content; StatusCode = $resp.StatusCode }
        } else {
            return @{ Success = $true; Data = $resp.Content; StatusCode = $resp.StatusCode; IsText = $true }
        }
    } catch {
        $errorResp = $_.Exception.Response
        if ($errorResp) {
            $reader = New-Object System.IO.StreamReader($errorResp.GetResponseStream())
            $errorContent = $reader.ReadToEnd()
            try {
                $errorData = $errorContent | ConvertFrom-Json
                return @{ Success = $false; Data = $errorData; StatusCode = [int]$errorResp.StatusCode }
            } catch {
                return @{ Success = $false; Data = @{ error = $errorContent }; StatusCode = [int]$errorResp.StatusCode }
            }
        }
        return @{ Success = $false; Data = @{ error = $_.Exception.Message }; StatusCode = 500 }
    }
}

function Write-TestResult {
    param([string]$TestName, [bool]$Passed, [string]$Message = "")
    $color = if ($Passed) { "Green" } else { "Red" }
    $status = if ($Passed) { " PASS" } else { " FAIL" }
    Write-Host "[$status] $TestName" -ForegroundColor $color
    if ($Message) { Write-Host "    $Message" -ForegroundColor Gray }
}

# Login
$adminLogin = Send-ApiRequest -Method POST -Path "/api/auth/login" -Body @{ username = "admin"; password = "123456" }
$adminToken = $adminLogin.Data.data.token

if ($Phase -eq "record") {
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "  Phase 1: Record data before restart" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host ""

    # Get ticket 3 details
    $ticketResp = Send-ApiRequest -Method GET -Path "/api/tickets/3" -Token $adminToken
    $ticket = $ticketResp.Data.data.ticket
    $statusLogs = $ticketResp.Data.data.statusLogs
    $assignmentLogs = $ticketResp.Data.data.assignmentLogs

    Write-Host "Ticket ID: 3" -ForegroundColor Yellow
    Write-Host "Status: $($ticket.status)"
    Write-Host "Status logs: $($statusLogs.Length)"
    Write-Host "Assignment logs: $($assignmentLogs.Length)"
    Write-Host ""

    # Export report
    $exportResp = Send-ApiRequest -Method GET -Path "/api/reports/export?status=closed" -Token $adminToken
    $csvContent = $exportResp.Data

    # Save to file
    $recordData = @{
        ticketId = 3
        ticketStatus = $ticket.status
        statusLogCount = $statusLogs.Length
        assignmentLogCount = $assignmentLogs.Length
        statusLogs = @($statusLogs | ForEach-Object { @{ fromStatus = $_.fromStatus; toStatus = $_.toStatus; operatorName = $_.operatorName; reason = $_.reason } })
        assignmentLogs = @($assignmentLogs | ForEach-Object { @{ fromTechnicianName = $_.fromTechnicianName; toTechnicianName = $_.toTechnicianName; operatorName = $_.operatorName; reason = $_.reason } })
        csvContent = $csvContent
        csvLength = $csvContent.Length
        recordedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }

    $recordData | ConvertTo-Json -Depth 10 | Out-File -FilePath $dataFile -Encoding UTF8
    Write-Host "Data saved to: $dataFile" -ForegroundColor Green
    Write-Host ""
    Write-Host "Please restart the server now, then run: .\test_persistence.ps1 verify" -ForegroundColor Yellow

} elseif ($Phase -eq "verify") {
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "  Phase 2: Verify data after restart" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host ""

    # Load recorded data
    if (-not (Test-Path $dataFile)) {
        Write-Host "ERROR: Data file not found. Please run with 'record' first." -ForegroundColor Red
        exit 1
    }

    $recorded = Get-Content $dataFile -Encoding UTF8 | ConvertFrom-Json
    Write-Host "Recorded at: $($recorded.recordedAt)" -ForegroundColor Gray
    Write-Host ""

    # Get current ticket details
    $ticketResp = Send-ApiRequest -Method GET -Path "/api/tickets/$($recorded.ticketId)" -Token $adminToken
    if (-not $ticketResp.Success) {
        Write-TestResult "Get ticket details" $false $ticketResp.Data.error
        exit 1
    }

    $ticket = $ticketResp.Data.data.ticket
    $statusLogs = $ticketResp.Data.data.statusLogs
    $assignmentLogs = $ticketResp.Data.data.assignmentLogs

    # Verify ticket status
    Write-TestResult "Ticket status unchanged" ($ticket.status -eq $recorded.ticketStatus) "Expected: $($recorded.ticketStatus), Actual: $($ticket.status)"

    # Verify status log count
    Write-TestResult "Status log count unchanged" ($statusLogs.Length -eq $recorded.statusLogCount) "Expected: $($recorded.statusLogCount), Actual: $($statusLogs.Length)"

    # Verify assignment log count
    Write-TestResult "Assignment log count unchanged" ($assignmentLogs.Length -eq $recorded.assignmentLogCount) "Expected: $($recorded.assignmentLogCount), Actual: $($assignmentLogs.Length)"

    # Verify status log content
    $statusLogsMatch = $true
    for ($i = 0; $i -lt [Math]::Min($statusLogs.Length, $recorded.statusLogs.Length); $i++) {
        if ($statusLogs[$i].operatorName -ne $recorded.statusLogs[$i].operatorName -or
            $statusLogs[$i].reason -ne $recorded.statusLogs[$i].reason) {
            $statusLogsMatch = $false
            break
        }
    }
    Write-TestResult "Status log content unchanged" $statusLogsMatch

    # Verify assignment log content
    $assignmentLogsMatch = $true
    for ($i = 0; $i -lt [Math]::Min($assignmentLogs.Length, $recorded.assignmentLogs.Length); $i++) {
        if ($assignmentLogs[$i].operatorName -ne $recorded.assignmentLogs[$i].operatorName -or
            $assignmentLogs[$i].toTechnicianName -ne $recorded.assignmentLogs[$i].toTechnicianName -or
            $assignmentLogs[$i].reason -ne $recorded.assignmentLogs[$i].reason) {
            $assignmentLogsMatch = $false
            break
        }
    }
    Write-TestResult "Assignment log content unchanged" $assignmentLogsMatch

    # Verify CSV export
    $exportResp = Send-ApiRequest -Method GET -Path "/api/reports/export?status=closed" -Token $adminToken
    $csvContent = $exportResp.Data

    Write-TestResult "CSV export length unchanged" ($csvContent.Length -eq $recorded.csvLength) "Expected: $($recorded.csvLength), Actual: $($csvContent.Length)"

    # Compare first 200 chars of CSV (skip BOM)
    $recordedCsvBody = $recorded.csvContent
    $currentCsvBody = $csvContent

    $csvMatch = $true
    $minLen = [Math]::Min($recordedCsvBody.Length, $currentCsvBody.Length)
    for ($i = 0; $i -lt $minLen; $i++) {
        if ($recordedCsvBody[$i] -ne $currentCsvBody[$i]) {
            $csvMatch = $false
            Write-Host "    CSV differs at position $i" -ForegroundColor Gray
            break
        }
    }
    Write-TestResult "CSV export content unchanged" $csvMatch

    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host "  Persistence Test Complete" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host ""

    # Show current data
    Write-Host "Current Ticket Status:" -ForegroundColor Yellow
    Write-Host "  ID: $($ticket.id), Status: $($ticket.status)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Status Timeline:" -ForegroundColor Yellow
    foreach ($log in $statusLogs) {
        Write-Host "  $($log.createdAt) - $($log.operatorName) : $($log.fromStatusLabel) -> $($log.toStatusLabel) - $($log.reason)" -ForegroundColor Gray
    }
}
