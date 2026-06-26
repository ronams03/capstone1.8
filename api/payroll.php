<?php
/**
 * Payroll API
 * Handles CRUD operations for payroll
 */

require_once 'config.php';
require_once 'utils.php';
require_once __DIR__ . '/mailer.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensurePhaseOneTables($conn);
$action = strtolower(trim((string)($_GET['action'] ?? '')));

switch ($method) {
    case 'GET':
        requireAnyFeatureAccess(['payroll', 'my_payslips'], ['admin', 'manager', 'staff'], $conn);
        handleGet($conn);
        break;
    case 'POST':
        requireFeatureAccess('payroll', ['admin', 'manager'], $conn);
        handlePost($conn);
        break;
    case 'PUT':
        if ($action === 'my_payslip_archive') {
            requireFeatureAccess('my_payslips', ['admin', 'manager', 'staff'], $conn);
            handleMyPayslipArchivePut($conn);
        } else {
            requireFeatureAccess('payroll', ['admin', 'manager'], $conn);
            handlePut($conn);
        }
        break;
    case 'DELETE':
        if ($action === 'my_payslip_archive') {
            requireFeatureAccess('my_payslips', ['admin', 'manager', 'staff'], $conn);
            handleMyPayslipArchiveDelete($conn);
        } else {
            requireFeatureAccess('payroll', ['admin', 'manager'], $conn);
            handleDelete($conn);
        }
        break;
    default:
        sendError('Method not allowed', 405);
}

function validatePayrollPeriodDates($payPeriodStart, $payPeriodEnd) {
    $payPeriodStart = trim((string)$payPeriodStart);
    $payPeriodEnd = trim((string)$payPeriodEnd);

    if (!validateDate($payPeriodStart) || !validateDate($payPeriodEnd)) {
        sendError('Pay period dates must use YYYY-MM-DD format.', 400);
    }

    if ($payPeriodStart > $payPeriodEnd) {
        sendError('Pay period start date cannot be after the end date.', 400);
    }

    $today = date('Y-m-d');
    if ($payPeriodStart > $today || $payPeriodEnd > $today) {
        sendError('Pay period cannot go beyond the current date (' . $today . ').', 400);
    }
}

function getCurrentSessionEmployeeId($conn) {
    $sessionEmployeeId = intval($_SESSION['employee_id'] ?? 0);
    if ($sessionEmployeeId > 0) return $sessionEmployeeId;

    $userId = intval($_SESSION['user_id'] ?? 0);
    if ($userId <= 0) return 0;

    $stmt = $conn->prepare("SELECT employee_id FROM users WHERE id = ? LIMIT 1");
    if (!$stmt) return 0;
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $employeeId = intval($row['employee_id'] ?? 0);
    if ($employeeId > 0) {
        $_SESSION['employee_id'] = $employeeId;
    }

    return $employeeId;
}

function getCurrentSessionUserId() {
    return intval($_SESSION['user_id'] ?? 0);
}

function getMyPayslipScopeValue() {
    $scope = strtolower(trim((string)($_GET['my_payslip_scope'] ?? '')));
    if ($scope === '') {
        return '';
    }

    if (!in_array($scope, ['active', 'archived'], true)) {
        sendError('Invalid payslip archive scope.', 400);
    }

    return $scope;
}

function getSelfServicePayslipArchiveContext($conn) {
    $role = strtolower(trim((string)($_SESSION['role'] ?? '')));
    if (!in_array($role, ['admin', 'manager', 'staff'], true)) {
        sendError('Forbidden', 403);
    }

    $userId = getCurrentSessionUserId();
    if ($userId <= 0) {
        sendError('Authentication required', 401);
    }

    $employeeId = getCurrentSessionEmployeeId($conn);
    if ($employeeId <= 0) {
        sendError('Your account is not linked to an employee record.', 403);
    }

    return [$role, $userId, $employeeId];
}

function getSelfServicePayslipArchiveRow($conn, $payrollId, $userId, $employeeId) {
    $sql = "SELECT p.*,
                   COALESCE(pua.is_archived, 0) AS user_is_archived,
                   pua.archived_at AS user_archived_at,
                   pua.deleted_at AS user_deleted_at
            FROM payroll p
            LEFT JOIN payroll_user_archive pua
              ON pua.payroll_id = p.id
             AND pua.user_id = ?
            WHERE p.id = ?
              AND p.employee_id = ?
              AND p.status IN ('approved', 'paid', 'archived')
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        sendError('Failed to prepare payslip archive lookup.', 500);
    }

    $stmt->bind_param('iii', $userId, $payrollId, $employeeId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row ?: null;
}

function saveSelfServicePayslipArchiveState($conn, $payrollId, $userId, $mode) {
    if ($mode === 'archive') {
        $sql = "INSERT INTO payroll_user_archive
                    (payroll_id, user_id, is_archived, archived_at, deleted_at)
                VALUES (?, ?, 1, NOW(), NULL)
                ON DUPLICATE KEY UPDATE
                    is_archived = 1,
                    archived_at = NOW(),
                    deleted_at = NULL";
    } elseif ($mode === 'restore') {
        $sql = "INSERT INTO payroll_user_archive
                    (payroll_id, user_id, is_archived, archived_at, deleted_at)
                VALUES (?, ?, 0, NULL, NULL)
                ON DUPLICATE KEY UPDATE
                    is_archived = 0,
                    archived_at = NULL,
                    deleted_at = NULL";
    } elseif ($mode === 'delete') {
        $sql = "INSERT INTO payroll_user_archive
                    (payroll_id, user_id, is_archived, archived_at, deleted_at)
                VALUES (?, ?, 0, NULL, NOW())
                ON DUPLICATE KEY UPDATE
                    is_archived = 0,
                    archived_at = NULL,
                    deleted_at = NOW()";
    } else {
        sendError('Invalid payslip archive action.', 400);
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        sendError('Failed to prepare payslip archive update.', 500);
    }

    $stmt->bind_param('ii', $payrollId, $userId);
    if (!$stmt->execute()) {
        $stmt->close();
        sendError('Failed to update payslip archive storage: ' . $conn->error, 500);
    }
    $stmt->close();
}

function normalizePayrollStatus($value, $default = 'draft', $allowArchived = true) {
    $allowed = ['draft', 'pending', 'approved', 'paid'];
    if ($allowArchived) {
        $allowed[] = 'archived';
    }

    $status = strtolower(trim((string)$value));
    if ($status === '') {
        $status = strtolower((string)$default);
    }

    if (!in_array($status, $allowed, true)) {
        sendError('Invalid payroll status.', 400);
    }

    return $status;
}

function normalizePayrollIds($value) {
    if (!is_array($value) || empty($value)) {
        sendError('At least one payroll ID is required.', 400);
    }

    $ids = [];
    foreach ($value as $rawId) {
        if (!is_numeric($rawId)) continue;
        $id = intval($rawId);
        if ($id > 0) {
            $ids[$id] = $id;
        }
    }

    $normalized = array_values($ids);
    if (empty($normalized)) {
        sendError('At least one valid payroll ID is required.', 400);
    }

    return $normalized;
}

function bindDynamicParams($stmt, $types, $params) {
    if (!$stmt || $types === '' || empty($params)) return;
    $stmt->bind_param($types, ...$params);
}

function buildInClause($count) {
    return implode(',', array_fill(0, max(0, intval($count)), '?'));
}

function sortPayrollIdsForCashAdvanceSync($payrollIds, $payrollRows) {
    $sortedIds = array_values(array_map('intval', $payrollIds));
    usort($sortedIds, function ($leftId, $rightId) use ($payrollRows) {
        $leftEnd = trim((string)($payrollRows[$leftId]['pay_period_end'] ?? ''));
        $rightEnd = trim((string)($payrollRows[$rightId]['pay_period_end'] ?? ''));

        $leftTs = $leftEnd !== '' ? (strtotime($leftEnd) ?: PHP_INT_MAX) : PHP_INT_MAX;
        $rightTs = $rightEnd !== '' ? (strtotime($rightEnd) ?: PHP_INT_MAX) : PHP_INT_MAX;

        if ($leftTs === $rightTs) {
            return $leftId <=> $rightId;
        }

        return $leftTs <=> $rightTs;
    });

    return $sortedIds;
}

function sendPayslipReleaseEmails($conn, $payrollIds) {
    if (empty($payrollIds)) return;

    try {
        // Determine base URL for email links
        $baseUrl = '';
        if (!empty($_SERVER['HTTP_ORIGIN'])) {
            $baseUrl = rtrim($_SERVER['HTTP_ORIGIN'], '/');
        } elseif (!empty($_SERVER['HTTP_REFERER'])) {
            $parsed = parse_url($_SERVER['HTTP_REFERER']);
            $baseUrl = ($parsed['scheme'] ?? 'http') . '://' . ($parsed['host'] ?? 'localhost') . (isset($parsed['port']) ? ':' . $parsed['port'] : '');
        } else {
            $baseUrl = 'http://localhost:3000';
        }

        // Fetch payroll + employee details for released records
        $placeholders = implode(',', array_fill(0, count($payrollIds), '?'));
        $types = str_repeat('i', count($payrollIds));

        $stmt = $conn->prepare("
            SELECT p.id AS payroll_id, e.email, e.first_name, e.last_name,
                   p.pay_period_start, p.pay_period_end, p.net_pay, p.gross_pay,
                   p.total_deductions
            FROM payroll p
            JOIN employees e ON e.employee_id = p.employee_id
            WHERE p.id IN ($placeholders)
        ");
        $stmt->bind_param($types, ...$payrollIds);
        $stmt->execute();
        $result = $stmt->get_result();
        $records = $result->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        // Send employee emails
        foreach ($records as $rec) {
            if (empty($rec['email'])) continue;

            $fullName = trim($rec['first_name'] . ' ' . $rec['last_name']);
            $grossPay = floatval($rec['gross_pay'] ?? 0);
            $deductions = floatval($rec['total_deductions'] ?? 0);
            $netPay = floatval($rec['net_pay'] ?? 0);

            $html = buildPayslipReleaseEmail(
                $fullName,
                $rec['pay_period_start'],
                $rec['pay_period_end'],
                $grossPay,
                $deductions,
                $netPay,
                $baseUrl
            );

            $periodLabel = date('M j', strtotime($rec['pay_period_start'])) . ' - ' . date('M j, Y', strtotime($rec['pay_period_end']));
            $subject = "Your Payslip for {$periodLabel} Has Been Released";
            $altBody = "Dear {$fullName}, your payslip for {$periodLabel} has been released. Net Pay: PHP " . number_format($netPay, 2) . ". Visit {$baseUrl}/my-payslips to view.";

            sendMail($rec['email'], $fullName, $subject, $html, $altBody);
        }

        // Send admin/manager summary notifications
        $adminStmt = $conn->prepare("
            SELECT email, first_name, last_name FROM users
            WHERE role IN ('admin','manager') AND status = 'active' AND email IS NOT NULL AND email != ''
        ");
        $adminStmt->execute();
        $adminResult = $adminStmt->get_result();
        $admins = $adminResult->fetch_all(MYSQLI_ASSOC);
        $adminStmt->close();

        if (!empty($admins) && !empty($records)) {
            foreach ($records as $rec) {
                $empName = trim($rec['first_name'] . ' ' . $rec['last_name']);
                $adminHtml = buildPayslipReleaseAdminEmail(
                    $empName,
                    $rec['pay_period_start'],
                    $rec['pay_period_end'],
                    $baseUrl
                );

                $periodLabel = date('M j', strtotime($rec['pay_period_start'])) . ' - ' . date('M j, Y', strtotime($rec['pay_period_end']));
                $adminSubject = "Payslip Released: {$empName} ({$periodLabel})";
                $adminAlt = "Payslip for {$empName} for period {$periodLabel} has been released.";

                foreach ($admins as $admin) {
                    // Don't send admin notification to the employee themselves
                    if (strcasecmp($admin['email'], $rec['email'] ?? '') === 0) continue;

                    $adminName = trim($admin['first_name'] . ' ' . $admin['last_name']);
                    sendMail($admin['email'], $adminName, $adminSubject, $adminHtml, $adminAlt);
                }
            }
        }

    } catch (\Throwable $e) {
        error_log('Payslip release email error: ' . $e->getMessage());
    }
}

function handleBulkStatusUpdate($conn, $data) {
    $status = normalizePayrollStatus($data['status'] ?? '', 'draft', true);
    $ids = normalizePayrollIds($data['ids'] ?? []);
    $placeholders = buildInClause(count($ids));

    $selectSql = "SELECT * FROM payroll WHERE id IN ($placeholders)";
    $selectStmt = $conn->prepare($selectSql);
    if (!$selectStmt) {
        sendError('Failed to prepare payroll lookup.', 500);
    }

    bindDynamicParams($selectStmt, str_repeat('i', count($ids)), $ids);
    $selectStmt->execute();
    $result = $selectStmt->get_result();

    $beforeRows = [];
    while ($row = $result->fetch_assoc()) {
        $beforeRows[intval($row['id'])] = $row;
    }
    $selectStmt->close();

    if (empty($beforeRows)) {
        sendError('Payroll records not found.', 404);
    }

    $eligibleIds = [];
    $skippedCount = 0;

    foreach ($beforeRows as $rowId => $row) {
        $currentStatus = strtolower((string)($row['status'] ?? ''));
        if ($currentStatus === $status) {
            $skippedCount++;
            continue;
        }
        if ($currentStatus === 'archived' && !in_array($status, ['approved', 'archived'], true)) {
            $skippedCount++;
            continue;
        }
        $eligibleIds[] = intval($rowId);
    }

    if (empty($eligibleIds)) {
        sendResponse(true, [
            'updated_count' => 0,
            'skipped_count' => $skippedCount,
            'status' => $status,
        ], 'No payroll records were eligible for update.');
    }

    $updatePlaceholders = buildInClause(count($eligibleIds));
    $updateSql = "UPDATE payroll SET status = ? WHERE id IN ($updatePlaceholders)";
    $updateStmt = $conn->prepare($updateSql);
    if (!$updateStmt) {
        sendError('Failed to prepare payroll status update.', 500);
    }

    $updateParams = array_merge([$status], $eligibleIds);
    bindDynamicParams($updateStmt, 's' . str_repeat('i', count($eligibleIds)), $updateParams);

    if (!$updateStmt->execute()) {
        sendError('Failed to update payroll records: ' . $conn->error, 500);
    }
    $updateStmt->close();

    if (in_array($status, ['approved', 'paid'], true)) {
        $syncIds = sortPayrollIdsForCashAdvanceSync($eligibleIds, $beforeRows);
        foreach ($syncIds as $payrollId) {
            syncPayrollCashAdvanceRequests($conn, $payrollId);
        }
    }

    $afterStmt = $conn->prepare($selectSql);
    if (!$afterStmt) {
        sendError('Payroll records updated, but failed to load the updated state.', 500);
    }
    bindDynamicParams($afterStmt, str_repeat('i', count($ids)), $ids);
    $afterStmt->execute();
    $afterResult = $afterStmt->get_result();

    $afterRows = [];
    while ($row = $afterResult->fetch_assoc()) {
        $afterRows[intval($row['id'])] = $row;
    }
    $afterStmt->close();

    if ($user_id = checkAuthentication()) {
        $eligibleArchivedCount = 0;
        foreach ($eligibleIds as $payrollId) {
            $beforeStatus = strtolower((string)($beforeRows[$payrollId]['status'] ?? ''));
            if ($beforeStatus === 'archived') {
                $eligibleArchivedCount++;
            }
        }
        $isRestore = $status === 'approved' && $eligibleArchivedCount === count($eligibleIds) && $eligibleArchivedCount > 0;
        $verb = $status === 'archived' ? 'archive' : ($isRestore ? 'restore' : 'update');
        logActivity(
            $conn,
            $user_id,
            $verb . '_payroll_bulk',
            ucfirst($status) . ' payroll records: ' . implode(', ', $eligibleIds),
            'payroll_management'
        );

        foreach ($eligibleIds as $payrollId) {
            if (!isset($beforeRows[$payrollId]) || !isset($afterRows[$payrollId])) continue;
            logAuditTrail($conn, $user_id, 'payroll', $payrollId, 'update', $beforeRows[$payrollId], $afterRows[$payrollId], basename(__FILE__));
        }
    }

    $updatedCount = count($eligibleIds);
    $message = $updatedCount === 1
        ? 'Payroll record updated successfully.'
        : 'Payroll records updated successfully.';
    if ($skippedCount > 0) {
        $message .= ' ' . $skippedCount . ' record(s) were skipped.';
    }

    $responseData = [
        'updated_count' => $updatedCount,
        'skipped_count' => $skippedCount,
        'status' => $status,
    ];

    if ($status === 'approved') {
        sendResponseAndContinue(true, $responseData, $message, 200, function () use ($conn, $eligibleIds) {
            sendPayslipReleaseEmails($conn, $eligibleIds);
        });
    }

    sendResponse(true, $responseData, $message);
}

/**
 * GET - Retrieve payroll records
 */
function handleGet($conn) {
    $payroll_id = $_GET['id'] ?? null;
    $role = strtolower((string)($_SESSION['role'] ?? ''));
    $selfEmployeeId = ($role === 'staff') ? getCurrentSessionEmployeeId($conn) : 0;
    $currentUserId = getCurrentSessionUserId();
    $myPayslipScope = getMyPayslipScopeValue();
    $useMyPayslipScope = $myPayslipScope !== '';
    if ($useMyPayslipScope) {
        $selfEmployeeId = getCurrentSessionEmployeeId($conn);
    }
    $releasedOnly = intval($_GET['released_only'] ?? 0) === 1;
    $include_archived = intval($_GET['include_archived'] ?? 0) === 1;
    $restrictToReleased = $releasedOnly || $role === 'staff' || $useMyPayslipScope;
    $releasedStatusesSql = ($restrictToReleased && $include_archived)
        ? "('approved', 'paid', 'archived')"
        : "('approved', 'paid')";
    $cashAdvanceSelectSql = ",
                       COALESCE(ca_summary.cash_advance_request_count, 0) AS cash_advance_request_count,
                       COALESCE(ca_summary.cash_advance_request_total, 0) AS cash_advance_request_total";
    $cashAdvanceJoinSql = "
                LEFT JOIN (
                    SELECT deducted_payroll_id,
                           COUNT(*) AS cash_advance_request_count,
                           COALESCE(SUM(amount), 0) AS cash_advance_request_total
                    FROM cash_advance_request
                    WHERE status = 'approved'
                      AND deducted_payroll_id IS NOT NULL
                    GROUP BY deducted_payroll_id
                ) ca_summary ON ca_summary.deducted_payroll_id = p.id";
    $personalArchiveSelectSql = '';
    $personalArchiveJoinSql = '';

    if ($useMyPayslipScope) {
        if ($currentUserId <= 0) {
            sendError('Authentication required', 401);
        }

        $personalArchiveSelectSql = ",
                       COALESCE(pua.is_archived, 0) AS user_is_archived,
                       pua.archived_at AS user_archived_at,
                       CASE WHEN pua.deleted_at IS NULL THEN 0 ELSE 1 END AS user_is_deleted";
        $personalArchiveJoinSql = "
                LEFT JOIN payroll_user_archive pua
                  ON pua.payroll_id = p.id
                 AND pua.user_id = " . intval($currentUserId);
    }

    if (($role === 'staff' || $useMyPayslipScope) && $selfEmployeeId <= 0) {
        sendError('Your account is not linked to an employee record.', 403);
    }
    
    if ($payroll_id) {
        // Get single payroll record
        $sql = "SELECT p.*, 
                       CONCAT(e.first_name, ' ', e.last_name) as full_employee_name,
                       e.employee_date_id,
                       b.branch_name" . $cashAdvanceSelectSql . $personalArchiveSelectSql . "
                FROM payroll p
                LEFT JOIN employees e ON p.employee_id = e.employee_id
                LEFT JOIN branches b ON e.branch_id = b.branch_id" . $cashAdvanceJoinSql . $personalArchiveJoinSql . "
                WHERE p.id = ?";

        if ($restrictToReleased) {
            $sql .= " AND p.status IN $releasedStatusesSql";
        }

        if ($useMyPayslipScope) {
            if ($myPayslipScope === 'archived') {
                $sql .= " AND COALESCE(pua.is_archived, 0) = 1 AND pua.deleted_at IS NULL";
            } else {
                $sql .= " AND COALESCE(pua.is_archived, 0) = 0 AND pua.deleted_at IS NULL";
            }
        }

        if ($role === 'staff' || $useMyPayslipScope) {
            $sql .= " AND p.employee_id = ?";
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('ii', $payroll_id, $selfEmployeeId);
        } else {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $payroll_id);
        }

        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($row = $result->fetch_assoc()) {
            sendResponse(true, $row, 'Payroll record retrieved successfully');
        } else {
            sendError('Payroll record not found', 404);
        }
    } else {
        // Get all payroll records
        $employee_id = $_GET['employee_id'] ?? null;
        $status = $_GET['status'] ?? null;
        $period_start = $_GET['period_start'] ?? null;
        $period_end = $_GET['period_end'] ?? null;
        if ($role === 'staff' || $useMyPayslipScope) {
            $employee_id = $selfEmployeeId;
        }
        
        $sql = "SELECT p.*, 
                       CONCAT(e.first_name, ' ', e.last_name) as full_employee_name,
                       e.employee_date_id,
                       b.branch_name" . $cashAdvanceSelectSql . $personalArchiveSelectSql . "
                FROM payroll p
                LEFT JOIN employees e ON p.employee_id = e.employee_id
                LEFT JOIN branches b ON e.branch_id = b.branch_id" . $cashAdvanceJoinSql . $personalArchiveJoinSql . "
                WHERE 1=1";
        
        $params = [];
        $types = '';
        
        if ($employee_id) {
            $sql .= " AND p.employee_id = ?";
            $params[] = $employee_id;
            $types .= 'i';
        }
        
        if ($status && $status !== 'all') {
            $status = normalizePayrollStatus($status, 'draft', true);
            $allowedReleasedStatuses = $include_archived
                ? ['approved', 'paid', 'archived']
                : ['approved', 'paid'];
            if ($restrictToReleased && !in_array($status, $allowedReleasedStatuses, true)) {
                sendError('Payslip is not yet released.', 403);
            }
            $sql .= " AND p.status = ?";
            $params[] = $status;
            $types .= 's';
        } elseif ($restrictToReleased) {
            $sql .= " AND p.status IN $releasedStatusesSql";
        } elseif (!$include_archived) {
            $sql .= " AND (p.status IS NULL OR p.status <> 'archived')";
        }

        if ($useMyPayslipScope) {
            if ($myPayslipScope === 'archived') {
                $sql .= " AND COALESCE(pua.is_archived, 0) = 1 AND pua.deleted_at IS NULL";
            } else {
                $sql .= " AND COALESCE(pua.is_archived, 0) = 0 AND pua.deleted_at IS NULL";
            }
        }
        
        if ($period_start) {
            $sql .= " AND p.pay_period_start >= ?";
            $params[] = $period_start;
            $types .= 's';
        }
        
        if ($period_end) {
            $sql .= " AND p.pay_period_end <= ?";
            $params[] = $period_end;
            $types .= 's';
        }
        
        $sql .= " ORDER BY p.pay_period_start DESC, p.created_at DESC";
        
        if (!empty($params)) {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            $result = $conn->query($sql);
        }
        
        $payroll_records = [];
        while ($row = $result->fetch_assoc()) {
            $payroll_records[] = $row;
        }
        
        sendResponse(true, $payroll_records, 'Payroll records retrieved successfully');
    }
}

function handleMyPayslipArchivePut($conn) {
    [, $currentUserId, $selfEmployeeId] = getSelfServicePayslipArchiveContext($conn);
    $data = getJSONInput();
    $payrollId = intval($data['payroll_id'] ?? $data['id'] ?? 0);
    if ($payrollId <= 0) {
        sendError('Payroll ID is required.', 400);
    }

    $action = strtolower(trim((string)($data['action'] ?? 'archive')));
    if (!in_array($action, ['archive', 'restore'], true)) {
        sendError('Invalid payslip archive action.', 400);
    }

    $before = getSelfServicePayslipArchiveRow($conn, $payrollId, $currentUserId, $selfEmployeeId);
    if (!$before) {
        sendError('Payslip not found.', 404);
    }

    $isArchived = intval($before['user_is_archived'] ?? 0) === 1;
    $isDeleted = !empty($before['user_deleted_at']);

    if ($action === 'archive') {
        if ($isDeleted) {
            sendError('This payslip was already removed from your archive storage.', 409);
        }
        if ($isArchived) {
            sendError('Payslip is already in your archive storage.', 409);
        }
    } else {
        if ($isDeleted) {
            sendError('Deleted archived payslips cannot be restored.', 409);
        }
        if (!$isArchived) {
            sendError('Payslip is not in your archive storage.', 409);
        }
    }

    saveSelfServicePayslipArchiveState($conn, $payrollId, $currentUserId, $action);
    $after = getSelfServicePayslipArchiveRow($conn, $payrollId, $currentUserId, $selfEmployeeId);
    $entityId = $payrollId . ':' . $currentUserId;

    if ($action === 'archive') {
        logActivity($conn, $currentUserId, 'archive_my_payslip', 'Archived payslip #' . $payrollId . ' in personal storage', 'payroll_management');
        logAuditTrail($conn, $currentUserId, 'payroll_user_archive', $entityId, 'archive', $before, $after, basename(__FILE__));
        sendResponse(true, $after, 'Payslip archived successfully.');
    }

    logActivity($conn, $currentUserId, 'restore_my_payslip', 'Restored payslip #' . $payrollId . ' from personal storage', 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payroll_user_archive', $entityId, 'restore', $before, $after, basename(__FILE__));
    sendResponse(true, $after, 'Payslip restored successfully.');
}

function handleMyPayslipArchiveDelete($conn) {
    [, $currentUserId, $selfEmployeeId] = getSelfServicePayslipArchiveContext($conn);
    $payrollId = intval($_GET['id'] ?? $_GET['payroll_id'] ?? 0);
    if ($payrollId <= 0) {
        sendError('Payroll ID is required.', 400);
    }

    $before = getSelfServicePayslipArchiveRow($conn, $payrollId, $currentUserId, $selfEmployeeId);
    if (!$before) {
        sendError('Payslip not found.', 404);
    }

    $isArchived = intval($before['user_is_archived'] ?? 0) === 1;
    $isDeleted = !empty($before['user_deleted_at']);
    if ($isDeleted) {
        sendError('Payslip was already removed from your archive storage.', 409);
    }
    if (!$isArchived) {
        sendError('Only archived payslips can be deleted from archive storage.', 400);
    }

    saveSelfServicePayslipArchiveState($conn, $payrollId, $currentUserId, 'delete');
    $after = getSelfServicePayslipArchiveRow($conn, $payrollId, $currentUserId, $selfEmployeeId);
    $entityId = $payrollId . ':' . $currentUserId;

    logActivity($conn, $currentUserId, 'delete_my_payslip_archive', 'Deleted archived payslip #' . $payrollId . ' from personal storage', 'payroll_management');
    logAuditTrail($conn, $currentUserId, 'payroll_user_archive', $entityId, 'delete', $before, $after, basename(__FILE__));
    sendResponse(true, null, 'Payslip deleted from archive storage successfully.');
}

/**
 * POST - Create new payroll record
 */
function handlePost($conn) {
    $data = getJSONInput();
    
    // Validate required fields
    $required = ['employee_id', 'pay_period_start', 'pay_period_end'];
    $missing = validateRequiredFields($data, $required);
    
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }

    if (!array_key_exists('cash_advance_manual_deduction', $data) && array_key_exists('cash_advance_deduction', $data)) {
        $data['cash_advance_manual_deduction'] = $data['cash_advance_deduction'];
    }
    
    $employee_id = intval($data['employee_id']);
    
    // Get employee details
    $emp_sql = "SELECT CONCAT(first_name, ' ', last_name) as name, salary,
                       sss_number, pagibig_number, philhealth_number, tin_number
                FROM employees WHERE employee_id = ?";
    $emp_stmt = $conn->prepare($emp_sql);
    $emp_stmt->bind_param('i', $employee_id);
    $emp_stmt->execute();
    $emp_result = $emp_stmt->get_result();
    
    if ($emp_result->num_rows === 0) {
        sendError('Employee not found', 404);
    }
    
    $employee = $emp_result->fetch_assoc();
    $employee_name = $employee['name'];
    $basic_salary = $employee['salary'];
    
    $pay_period_start = $data['pay_period_start'];
    $pay_period_end = $data['pay_period_end'];
    validatePayrollPeriodDates($pay_period_start, $pay_period_end);
    $overtime_hours = $data['overtime_hours'] ?? 0;
    $overtime_rate = $data['overtime_rate'] ?? 0;
    $overtime_pay = $overtime_hours * $overtime_rate;
    $bonus = $data['bonus'] ?? 0;
    
    // Allowances
    $clothing_allowance = $data['clothing_allowance'] ?? 0;
    $travel_allowance = $data['travel_allowance'] ?? 0;
    $salary_adjustment = $data['salary_adjustment'] ?? 0;
    
    // Attendance deductions
    $late_deduction = $data['late_deduction'] ?? 0;
    $absence_deduction = $data['absence_deduction'] ?? 0;
    
    // Government contributions
    $tax = $data['tax'] ?? 0;
    $sss_contribution = $data['sss_contribution'] ?? 0;
    $pagibig_contribution = $data['pagibig_contribution'] ?? 0;
    $philhealth_contribution = $data['philhealth_contribution'] ?? 0;

    // Auto-calculate government deductions from settings when values are empty/zero
    $govEligibility = buildGovEligibilityFromEmployee($employee);
    $govDefaults = computeGovernmentDeductionsFromTypes($conn, floatval($basic_salary), $govEligibility);
    if (isset($govDefaults['tax']) && floatval($tax) <= 0) {
        $tax = $govDefaults['tax'];
    }
    if (isset($govDefaults['sss_contribution']) && floatval($sss_contribution) <= 0) {
        $sss_contribution = $govDefaults['sss_contribution'];
    }
    if (isset($govDefaults['pagibig_contribution']) && floatval($pagibig_contribution) <= 0) {
        $pagibig_contribution = $govDefaults['pagibig_contribution'];
    }
    if (isset($govDefaults['philhealth_contribution']) && floatval($philhealth_contribution) <= 0) {
        $philhealth_contribution = $govDefaults['philhealth_contribution'];
    }
    
    // Loan deductions
    $cash_advance_manual_deduction = $data['cash_advance_manual_deduction'] ?? 0;
    $cash_advance_deduction = $cash_advance_manual_deduction;
    $laptop_loan_deduction = $data['laptop_loan_deduction'] ?? 0;
    $other_deductions = $data['other_deductions'] ?? 0;
    
    // Calculate totals — bonus excluded from gross per client requirement
    $gross_pay = $basic_salary + $overtime_pay + $clothing_allowance + $travel_allowance + $salary_adjustment - $late_deduction - $absence_deduction;
    $total_deductions = $tax + $sss_contribution + $pagibig_contribution + $philhealth_contribution + $cash_advance_deduction + $laptop_loan_deduction + $other_deductions;
    $net_pay = max(0, $gross_pay - $total_deductions + $bonus);
    
    $status = normalizePayrollStatus($data['status'] ?? 'draft', 'draft', false);
    $notes = sanitizeInput($data['notes'] ?? '');
    
    $sql = "INSERT INTO payroll (employee_id, employee_name, pay_period_start, pay_period_end, 
                                 basic_salary, overtime_hours, overtime_rate, overtime_pay, bonus, 
                                 clothing_allowance, travel_allowance, salary_adjustment,
                                 late_deduction, absence_deduction,
                                 tax, sss_contribution, pagibig_contribution, philhealth_contribution, 
                                 cash_advance_deduction, cash_advance_manual_deduction, laptop_loan_deduction, other_deductions,
                                 gross_pay, total_deductions, net_pay, status, notes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $types = 'isss' . str_repeat('d', 21) . 'ss';
    $stmt->bind_param($types, 
        $employee_id, $employee_name, $pay_period_start, $pay_period_end,
        $basic_salary, $overtime_hours, $overtime_rate, $overtime_pay, $bonus,
        $clothing_allowance, $travel_allowance, $salary_adjustment,
        $late_deduction, $absence_deduction,
        $tax, $sss_contribution, $pagibig_contribution, $philhealth_contribution,
        $cash_advance_deduction, $cash_advance_manual_deduction, $laptop_loan_deduction, $other_deductions,
        $gross_pay, $total_deductions, $net_pay, $status, $notes
    );
    
    if ($stmt->execute()) {
        $payroll_id = $conn->insert_id;
        syncPayrollCashAdvanceRequests($conn, $payroll_id);
        $afterRow = null;
        $afterStmt = $conn->prepare("SELECT * FROM payroll WHERE id = ? LIMIT 1");
        if ($afterStmt) {
            $afterStmt->bind_param('i', $payroll_id);
            $afterStmt->execute();
            $afterRow = $afterStmt->get_result()->fetch_assoc();
            $afterStmt->close();
        }
        
        // Log activity
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'create_payroll', "Created payroll for: $employee_name", 'payroll_management');
            logAuditTrail($conn, $user_id, 'payroll', $payroll_id, 'create', null, $afterRow, basename(__FILE__));
        }
        
        sendResponse(true, [
            'payroll_id' => $payroll_id,
            'gross_pay' => floatval($afterRow['gross_pay'] ?? $gross_pay),
            'total_deductions' => floatval($afterRow['total_deductions'] ?? $total_deductions),
            'net_pay' => floatval($afterRow['net_pay'] ?? $net_pay)
        ], 'Payroll record created successfully', 201);
    } else {
        sendError('Failed to create payroll record: ' . $conn->error, 500);
    }
}

/**
 * PUT - Update payroll record
 */
function handlePut($conn) {
    $data = getJSONInput();

    if (!array_key_exists('cash_advance_manual_deduction', $data) && array_key_exists('cash_advance_deduction', $data)) {
        $data['cash_advance_manual_deduction'] = $data['cash_advance_deduction'];
    }
    unset($data['cash_advance_deduction']);

    if (isset($data['ids']) && is_array($data['ids'])) {
        handleBulkStatusUpdate($conn, $data);
    }
    
    if (!isset($data['id'])) {
        sendError('Payroll ID is required', 400);
    }
    
    $payroll_id = intval($data['id']);
    
    // Check if payroll exists
    $check_sql = "SELECT id FROM payroll WHERE id = ?";
    $check_stmt = $conn->prepare($check_sql);
    $check_stmt->bind_param('i', $payroll_id);
    $check_stmt->execute();
    
    if ($check_stmt->get_result()->num_rows === 0) {
        sendError('Payroll record not found', 404);
    }
    $check_stmt->close();
    
    // Get current values
    $current_sql = "SELECT * FROM payroll WHERE id = ?";
    $current_stmt = $conn->prepare($current_sql);
    $current_stmt->bind_param('i', $payroll_id);
    $current_stmt->execute();
    $current = $current_stmt->get_result()->fetch_assoc();
    $current_stmt->close();

    // Auto-calculate government deductions from settings when values are empty/zero
    $govEligibility = null;
    if (!empty($current['employee_id'])) {
        $empStmt = $conn->prepare("SELECT sss_number, pagibig_number, philhealth_number, tin_number FROM employees WHERE employee_id = ? LIMIT 1");
        if ($empStmt) {
            $empStmt->bind_param('i', $current['employee_id']);
            $empStmt->execute();
            $empRow = $empStmt->get_result()->fetch_assoc();
            $empStmt->close();
            $govEligibility = buildGovEligibilityFromEmployee($empRow);
        }
    }

    $govDefaults = computeGovernmentDeductionsFromTypes($conn, floatval($current['basic_salary'] ?? 0), $govEligibility);
    foreach ($govDefaults as $field => $amount) {
        $incoming = isset($data[$field]) ? floatval($data[$field]) : floatval($current[$field] ?? 0);
        if ($incoming <= 0) {
            $data[$field] = $amount;
        }
    }

    $currentStatus = strtolower((string)($current['status'] ?? 'draft'));
    $nextStatus = isset($data['status'])
        ? normalizePayrollStatus($data['status'], $currentStatus, true)
        : $currentStatus;
    $hasNonStatusUpdates = count(array_diff(array_keys($data), ['id', 'status'])) > 0;

    if ($currentStatus === 'archived') {
        if ($hasNonStatusUpdates) {
            sendError('Archived payroll records cannot be modified.', 400);
        }

        if ($nextStatus === 'approved') {
            // Allow restoring archived payroll records back to active scope.
        } elseif ($nextStatus !== 'archived') {
            sendError('Archived payroll records can only be restored to approved status.', 400);
        } else {
            sendResponse(true, [
                'gross_pay' => floatval($current['gross_pay'] ?? 0),
                'total_deductions' => floatval($current['total_deductions'] ?? 0),
                'net_pay' => floatval($current['net_pay'] ?? 0)
            ], 'Payroll record is already archived.');
        }

    }

    if ($nextStatus === 'archived' && $hasNonStatusUpdates) {
        sendError('Archive payroll records separately from other updates.', 400);
    }

    $payPeriodStart = isset($data['pay_period_start']) ? $data['pay_period_start'] : $current['pay_period_start'];
    $payPeriodEnd = isset($data['pay_period_end']) ? $data['pay_period_end'] : $current['pay_period_end'];
    validatePayrollPeriodDates($payPeriodStart, $payPeriodEnd);
    
    // Use new values or keep current (null-coalesce)
    $v = function($field) use ($data, $current) {
        return isset($data[$field]) ? floatval($data[$field]) : floatval($current[$field]);
    };
    
    $ot_hours = $v('overtime_hours');
    $ot_rate = $v('overtime_rate');
    $ot_pay = $ot_hours * $ot_rate;
    $bonus_amt = $v('bonus');
    
    // Allowances
    $clothing = $v('clothing_allowance');
    $travel = $v('travel_allowance');
    $adj = $v('salary_adjustment');
    
    // Attendance deductions
    $late = $v('late_deduction');
    $absence = $v('absence_deduction');
    
    // Gross — bonus excluded per client requirement
    $gross_pay = $current['basic_salary'] + $ot_pay + $clothing + $travel + $adj - $late - $absence;
    
    // Government contributions
    $tax_amt = $v('tax');
    $sss_amt = $v('sss_contribution');
    $pagibig_amt = $v('pagibig_contribution');
    $philhealth_amt = $v('philhealth_contribution');
    
    // Loan deductions
    $ca_amt = isset($data['cash_advance_manual_deduction'])
        ? floatval($data['cash_advance_manual_deduction'])
        : floatval($current['cash_advance_manual_deduction'] ?? ($current['cash_advance_deduction'] ?? 0));
    $laptop_amt = $v('laptop_loan_deduction');
    $other_amt = $v('other_deductions');
    
    $total_deductions = $tax_amt + $sss_amt + $pagibig_amt + $philhealth_amt + $ca_amt + $laptop_amt + $other_amt;
    $net_pay = max(0, $gross_pay - $total_deductions + $bonus_amt);
    
    $updates = [];
    $params = [];
    $types = '';
    
    $allowed_fields = ['pay_period_start', 'pay_period_end', 'overtime_hours', 'overtime_rate', 
                       'bonus', 'clothing_allowance', 'travel_allowance', 'salary_adjustment',
                       'late_deduction', 'absence_deduction',
                       'tax', 'sss_contribution', 'pagibig_contribution', 
                       'philhealth_contribution', 'cash_advance_manual_deduction', 'laptop_loan_deduction',
                       'other_deductions', 'status', 'notes'];
    $numeric_fields = [
        'overtime_hours',
        'overtime_rate',
        'bonus',
        'clothing_allowance',
        'travel_allowance',
        'salary_adjustment',
        'late_deduction',
        'absence_deduction',
        'tax',
        'sss_contribution',
        'pagibig_contribution',
        'philhealth_contribution',
        'cash_advance_manual_deduction',
        'laptop_loan_deduction',
        'other_deductions'
    ];
    
    foreach ($allowed_fields as $field) {
        if (isset($data[$field])) {
            $updates[] = "$field = ?";
            
            if ($field === 'status') {
                $params[] = $nextStatus;
                $types .= 's';
            } elseif (in_array($field, $numeric_fields, true)) {
                $params[] = floatval($data[$field]);
                $types .= 'd';
            } else {
                $params[] = sanitizeInput($data[$field]);
                $types .= 's';
            }
        }
    }
    
    // Always update calculated fields
    $updates[] = "overtime_pay = ?";
    $updates[] = "gross_pay = ?";
    $updates[] = "total_deductions = ?";
    $updates[] = "net_pay = ?";
    $params[] = $ot_pay;
    $params[] = $gross_pay;
    $params[] = $total_deductions;
    $params[] = $net_pay;
    $types .= 'dddd';
    
    $params[] = $payroll_id;
    $types .= 'i';
    
    $sql = "UPDATE payroll SET " . implode(', ', $updates) . " WHERE id = ?";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    
    if ($stmt->execute()) {
        syncPayrollCashAdvanceRequests($conn, $payroll_id);
        $after = null;
        $afterStmt = $conn->prepare("SELECT * FROM payroll WHERE id = ? LIMIT 1");
        if ($afterStmt) {
            $afterStmt->bind_param('i', $payroll_id);
            $afterStmt->execute();
            $after = $afterStmt->get_result()->fetch_assoc();
            $afterStmt->close();
        }

        // Log activity
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'update_payroll', "Updated payroll ID: $payroll_id", 'payroll_management');
            logAuditTrail($conn, $user_id, 'payroll', $payroll_id, 'update', $current, $after, basename(__FILE__));
        }

        $responseData = [
            'gross_pay' => floatval($after['gross_pay'] ?? $gross_pay),
            'total_deductions' => floatval($after['total_deductions'] ?? $total_deductions),
            'net_pay' => floatval($after['net_pay'] ?? $net_pay)
        ];

        if (isset($data['status']) && $nextStatus === 'approved') {
            sendResponseAndContinue(true, $responseData, 'Payroll record updated successfully', 200, function () use ($conn, $payroll_id) {
                sendPayslipReleaseEmails($conn, [$payroll_id]);
            });
        }

        sendResponse(true, $responseData, 'Payroll record updated successfully');
    } else {
        sendError('Failed to update payroll record: ' . $conn->error, 500);
    }
}

/**
 * DELETE - Delete payroll record
 */
function handleDelete($conn) {
    $payroll_id = $_GET['id'] ?? null;
    
    if (!$payroll_id) {
        sendError('Payroll ID is required', 400);
    }
    
    $payroll_id = intval($payroll_id);
    
    // Only allow deletion of draft or archived records
    $check_sql = "SELECT * FROM payroll WHERE id = ?";
    $check_stmt = $conn->prepare($check_sql);
    $check_stmt->bind_param('i', $payroll_id);
    $check_stmt->execute();
    $result = $check_stmt->get_result();
    
    if ($result->num_rows === 0) {
        sendError('Payroll record not found', 404);
    }
    
    $record = $result->fetch_assoc();
    $check_stmt->close();
    if ($record['status'] !== 'draft' && $record['status'] !== 'archived') {
        sendError('Only draft or archived payroll records can be deleted', 400);
    }
    
    $sql = "DELETE FROM payroll WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $payroll_id);
    
    if ($stmt->execute()) {
        // Log activity
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'delete_payroll', "Deleted payroll ID: $payroll_id", 'payroll_management');
            logAuditTrail($conn, $user_id, 'payroll', $payroll_id, 'delete', $record, null, basename(__FILE__));
        }
        
        sendResponse(true, null, 'Payroll record deleted successfully');
    } else {
        sendError('Failed to delete payroll record: ' . $conn->error, 500);
    }
}

closeDBConnection($conn);
?>
