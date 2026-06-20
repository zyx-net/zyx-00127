# ==============================================
# 社区维修调度台 API 测试脚本
# ==============================================

$baseUrl = "http://localhost:3001"

# 辅助函数：发送 HTTP 请求
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
        $contentType = $resp.Headers['Content-Type']
        if ($contentType -like '*application/json*') {
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

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  API Test: Maintenance Dispatch System" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# ==============================================
# Test 1: Login
# ==============================================
Write-Host "--- Test 1: Login ---" -ForegroundColor Yellow

$zhangsanLogin = Send-ApiRequest -Method POST -Path "/api/auth/login" -Body @{ username = "zhangsan"; password = "123456" }
$zhangsanToken = $zhangsanLogin.Data.data.token
$zhangsanUser = $zhangsanLogin.Data.data.user
Write-TestResult "Zhangsan login success" $zhangsanLogin.Data.success "Role: $($zhangsanUser.role)"

$dispatcherLogin = Send-ApiRequest -Method POST -Path "/api/auth/login" -Body @{ username = "dispatcher"; password = "123456" }
$dispatcherToken = $dispatcherLogin.Data.data.token
$dispatcherUser = $dispatcherLogin.Data.data.user
Write-TestResult "Dispatcher login success" $dispatcherLogin.Data.success "Role: $($dispatcherUser.role)"

$adminLogin = Send-ApiRequest -Method POST -Path "/api/auth/login" -Body @{ username = "admin"; password = "123456" }
$adminToken = $adminLogin.Data.data.token
$adminUser = $adminLogin.Data.data.user
Write-TestResult "Admin login success" $adminLogin.Data.success "Role: $($adminUser.role)"

Write-Host ""

# ==============================================
# Test 2: Required field validation
# ==============================================
Write-Host "--- Test 2: Required Validation ---" -ForegroundColor Yellow

$testNoAddress = Send-ApiRequest -Method POST -Path "/api/tickets" -Token $zhangsanToken -Body @{
    title = "Test no address"; description = "Test desc"; repairTypeId = 1
}
Write-TestResult "Reject when address missing" (-not $testNoAddress.Data.success) $testNoAddress.Data.error

$testNoType = Send-ApiRequest -Method POST -Path "/api/tickets" -Token $zhangsanToken -Body @{
    title = "Test no type"; description = "Test desc"; address = "Bldg 1 Unit 1 Room 101"
}
Write-TestResult "Reject when repair type missing" (-not $testNoType.Data.success) $testNoType.Data.error

Write-Host ""

# ==============================================
# Test 3: Create water leak ticket
# ==============================================
Write-Host "--- Test 3: Create Ticket ---" -ForegroundColor Yellow

$createTicket = Send-ApiRequest -Method POST -Path "/api/tickets" -Token $zhangsanToken -Body @{
    title = "Kitchen water pipe leak"
    description = "Water leak under kitchen sink, water on floor"
    address = "Bldg 1 Unit 1 Room 101"
    repairTypeId = 1
}
$newTicketId = $createTicket.Data.data.id
Write-TestResult "Create water leak ticket success" $createTicket.Data.success "Ticket ID: $newTicketId"

Write-Host ""

# ==============================================
# Test 4: Resident permission control
# ==============================================
Write-Host "--- Test 4: Permission Control ---" -ForegroundColor Yellow

$zhangsanTickets = Send-ApiRequest -Method GET -Path "/api/tickets" -Token $zhangsanToken
$tickets = $zhangsanTickets.Data.data
$allMine = $true
foreach ($t in $tickets) { if ($t.residentId -ne $zhangsanUser.id) { $allMine = $false } }
Write-TestResult "Zhangsan sees only his tickets" $allMine "Count: $($tickets.Length)"

$lisiLogin = Send-ApiRequest -Method POST -Path "/api/auth/login" -Body @{ username = "lisi"; password = "123456" }
$lisiToken = $lisiLogin.Data.data.token
$lisiUser = $lisiLogin.Data.data.user
$lisiTickets = Send-ApiRequest -Method GET -Path "/api/tickets" -Token $lisiToken
$tickets = $lisiTickets.Data.data
$allMine = $true
foreach ($t in $tickets) { if ($t.residentId -ne $lisiUser.id) { $allMine = $false } }
Write-TestResult "Lisi sees only his tickets" $allMine "Count: $($tickets.Length)"

$viewOthersTicket = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $lisiToken
Write-TestResult "Lisi cannot view Zhangsan's ticket" (-not $viewOthersTicket.Data.success) $viewOthersTicket.Data.error

Write-Host ""

# ==============================================
# Test 5: Assign to available technician
# ==============================================
Write-Host "--- Test 5: Assign ---" -ForegroundColor Yellow

$today = Get-Date
$startTime = $today.ToString("yyyy-MM-dd") + " 10:00:00"
$endTime = $today.ToString("yyyy-MM-dd") + " 11:00:00"

$assignTicket = Send-ApiRequest -Method POST -Path "/api/tickets/$newTicketId/assign" -Token $dispatcherToken -Body @{
    technicianId = 1
    scheduledStartTime = $startTime
    scheduledEndTime = $endTime
    reason = "Emergency water leak repair"
}
Write-TestResult "Assign to Wang Shifu success" $assignTicket.Data.success "Time: $startTime - $endTime"

$ticketDetail = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $dispatcherToken
$status = $ticketDetail.Data.data.ticket.status
Write-TestResult "Status becomes assigned" ($status -eq "assigned") "Current: $status"

Write-Host ""

# ==============================================
# Test 6: Time conflict detection
# ==============================================
Write-Host "--- Test 6: Time Conflict ---" -ForegroundColor Yellow

$startTime = $today.ToString("yyyy-MM-dd") + " 10:30:00"
$endTime = $today.ToString("yyyy-MM-dd") + " 11:30:00"

$conflictAssign = Send-ApiRequest -Method POST -Path "/api/tickets/1/assign" -Token $dispatcherToken -Body @{
    technicianId = 1
    scheduledStartTime = $startTime
    scheduledEndTime = $endTime
    reason = "Test time conflict"
}
Write-TestResult "Reject overlapping assignment" (-not $conflictAssign.Data.success) $conflictAssign.Data.error

Write-Host ""

# ==============================================
# Test 7: Reassign
# ==============================================
Write-Host "--- Test 7: Reassign ---" -ForegroundColor Yellow

$startTime = $today.ToString("yyyy-MM-dd") + " 14:00:00"
$endTime = $today.ToString("yyyy-MM-dd") + " 15:00:00"

$reassignTicket = Send-ApiRequest -Method POST -Path "/api/tickets/$newTicketId/assign" -Token $dispatcherToken -Body @{
    technicianId = 2
    scheduledStartTime = $startTime
    scheduledEndTime = $endTime
    reason = "Wang Shifu has emergency, reassign to Li Shifu"
}
Write-TestResult "Reassign to Li Shifu success" $reassignTicket.Data.success "Time: $startTime - $endTime"

$ticketDetail = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $dispatcherToken
$status = $ticketDetail.Data.data.ticket.status
$techId = $ticketDetail.Data.data.ticket.currentTechnicianId
Write-TestResult "Status becomes reassigned, tech is Li Shifu" ($status -eq "reassigned" -and $techId -eq 2) "Status: $status, Tech ID: $techId"

Write-Host ""

# ==============================================
# Test 8: Mark complete pending review
# ==============================================
Write-Host "--- Test 8: Complete ---" -ForegroundColor Yellow

$completeTicket = Send-ApiRequest -Method POST -Path "/api/tickets/$newTicketId/complete" -Token $dispatcherToken -Body @{
    reason = "Fixed pipe connection, no leak after test"
}
Write-TestResult "Mark complete success" $completeTicket.Data.success

$ticketDetail = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $dispatcherToken
$status = $ticketDetail.Data.data.ticket.status
Write-TestResult "Status becomes completed" ($status -eq "completed") "Current: $status"

Write-Host ""

# ==============================================
# Test 9: Review and close (admin)
# ==============================================
Write-Host "--- Test 9: Close ---" -ForegroundColor Yellow

$closeTicket = Send-ApiRequest -Method POST -Path "/api/tickets/$newTicketId/close" -Token $adminToken -Body @{
    reason = "Called resident, confirmed repair done"
}
Write-TestResult "Close success" $closeTicket.Data.success

$ticketDetail = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $adminToken
$status = $ticketDetail.Data.data.ticket.status
Write-TestResult "Status becomes closed" ($status -eq "closed") "Current: $status"

Write-Host ""

# ==============================================
# Test 10: Audit trail
# ==============================================
Write-Host "--- Test 10: Audit Trail ---" -ForegroundColor Yellow

$ticketDetail = Send-ApiRequest -Method GET -Path "/api/tickets/$newTicketId" -Token $adminToken
$statusLogs = $ticketDetail.Data.data.statusLogs
$assignmentLogs = $ticketDetail.Data.data.assignmentLogs

Write-TestResult "Status logs recorded" ($statusLogs.Length -ge 4) "Status changes: $($statusLogs.Length)"
Write-TestResult "Assignment logs recorded" ($assignmentLogs.Length -ge 2) "Assignments: $($assignmentLogs.Length)"

$hasOperator = $true
foreach ($log in $statusLogs) { if (-not $log.operatorName) { $hasOperator = $false } }
Write-TestResult "Status logs include operator" $hasOperator

Write-Host ""
Write-Host "Status Timeline:" -ForegroundColor Cyan
foreach ($log in $statusLogs) {
    Write-Host "  $($log.createdAt) - $($log.operatorName) : $($log.fromStatusLabel) -> $($log.toStatusLabel) - $($log.reason)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Assignment History:" -ForegroundColor Cyan
foreach ($log in $assignmentLogs) {
    $from = if ($log.fromTechnicianName) { $log.fromTechnicianName } else { "None" }
    Write-Host "  $($log.createdAt) - $($log.operatorName) : $from -> $($log.toTechnicianName) - $($log.reason)" -ForegroundColor Gray
}

Write-Host ""

# ==============================================
# Test 11: Export report
# ==============================================
Write-Host "--- Test 11: Export Report ---" -ForegroundColor Yellow

$exportResp = Send-ApiRequest -Method GET -Path "/api/reports/export?status=closed" -Token $adminToken
if ($exportResp.Success -and $exportResp.IsText) {
    $csvContent = $exportResp.Data
    Write-TestResult "Export CSV success" $true "Length: $($csvContent.Length) chars"
    Write-Host "Preview:" -ForegroundColor Gray
    $previewLen = [Math]::Min(300, $csvContent.Length)
    Write-Host $csvContent.Substring(0, $previewLen) -ForegroundColor Gray
} else {
    $errMsg = if ($exportResp.Data -and $exportResp.Data.error) { $exportResp.Data.error } else { "Unexpected response format" }
    Write-TestResult "Export CSV success" $false $errMsg
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  API Test Complete" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ticket ID for persistence test: $newTicketId" -ForegroundColor Yellow
Write-Host "Please restart server and verify data persistence" -ForegroundColor Yellow
