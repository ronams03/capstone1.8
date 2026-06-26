<?php
/**
 * Approval Inbox API (Phase 1 MVP)
 * Unified manager/admin approval queue with SLA reminders.
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
if ($method !== 'GET') {
    sendError('Method not allowed', 405);
}

requireFeatureAccess('approval_inbox', ['admin', 'manager']);

$conn = getDBConnection();
ensurePhaseOneTables($conn);

$role = strtolower(trim((string)($_SESSION['role'] ?? '')));
if (!in_array($role, ['manager', 'admin'], true)) {
    sendError('Forbidden', 403);
}

$typeFilter = strtolower(trim((string)($_GET['type'] ?? 'all')));
$allowedTypes = ['all', 'leave', 'overtime', 'payslip_dispute'];
if (!in_array($typeFilter, $allowedTypes, true)) {
    sendError('Invalid type filter', 400);
}

$slaFilter = strtolower(trim((string)($_GET['sla_status'] ?? 'all')));
$allowedSla = ['all', 'overdue', 'due_soon', 'on_track'];
if (!in_array($slaFilter, $allowedSla, true)) {
    sendError('Invalid SLA status filter', 400);
}

function resolveSlaStatus($dueAt) {
    $dueTs = strtotime((string)$dueAt);
    $nowTs = time();
    if (!$dueTs) {
        return [
            'status' => 'on_track',
            'remaining_minutes' => null,
            'remaining_label' => 'No SLA',
        ];
    }

    $remainingMinutes = intval(floor(($dueTs - $nowTs) / 60));
    if ($remainingMinutes < 0) {
        $lateMinutes = abs($remainingMinutes);
        if ($lateMinutes >= 60) {
            $hours = intval(ceil($lateMinutes / 60));
            $label = 'Overdue by ' . $hours . 'h';
        } else {
            $label = 'Overdue by ' . $lateMinutes . 'm';
        }
        return [
            'status' => 'overdue',
            'remaining_minutes' => $remainingMinutes,
            'remaining_label' => $label,
        ];
    }

    if ($remainingMinutes <= 360) {
        if ($remainingMinutes >= 60) {
            $hours = intval(ceil($remainingMinutes / 60));
            $label = 'Due in ' . $hours . 'h';
        } else {
            $label = 'Due in ' . max(1, $remainingMinutes) . 'm';
        }
        return [
            'status' => 'due_soon',
            'remaining_minutes' => $remainingMinutes,
            'remaining_label' => $label,
        ];
    }

    $hours = intval(ceil($remainingMinutes / 60));
    return [
        'status' => 'on_track',
        'remaining_minutes' => $remainingMinutes,
        'remaining_label' => 'Due in ' . $hours . 'h',
    ];
}

function getApprovalInboxSlaHours($conn, $itemKey, $defaultHours) {
    $key = trim((string)$itemKey);
    if ($key === '') return max(1, intval($defaultHours));

    $stmt = $conn->prepare("SELECT sla_hours FROM approval_sla_config WHERE item_key = ? LIMIT 1");
    if (!$stmt) return max(1, intval($defaultHours));
    $stmt->bind_param('s', $key);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return max(1, intval($row['sla_hours'] ?? $defaultHours));
}

function addApprovalItem(&$items, $type, $id, $title, $subtitle, $submittedAt, $slaDueAt, $priority, $link, $meta = []) {
    $sla = resolveSlaStatus($slaDueAt);
    $items[] = [
        'type' => $type,
        'id' => $id,
        'title' => $title,
        'subtitle' => $subtitle,
        'submitted_at' => $submittedAt,
        'sla_due_at' => $slaDueAt,
        'sla_status' => $sla['status'],
        'sla_remaining_minutes' => $sla['remaining_minutes'],
        'sla_label' => $sla['remaining_label'],
        'priority' => $priority,
        'link' => $link,
        'meta' => $meta,
    ];
}

$slaLeaveHours = getApprovalInboxSlaHours($conn, 'leave', 48);
$slaOvertimeHours = getApprovalInboxSlaHours($conn, 'overtime', 24);
$slaDisputeHours = getApprovalInboxSlaHours($conn, 'payslip_dispute', 72);

$items = [];

if ($typeFilter === 'all' || $typeFilter === 'leave') {
    $leaveSql = "SELECT lr.leave_request_id,
                        lr.employee_id,
                        lr.leave_type,
                        lr.start_date,
                        lr.end_date,
                        lr.reason,
                        lr.created_at,
                        CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                        COALESCE(
                            (SELECT LOWER(u.role) FROM users u WHERE u.employee_id = lr.employee_id ORDER BY u.id DESC LIMIT 1),
                            LOWER(TRIM(e.position))
                        ) AS employee_role
                 FROM leave_request lr
                 LEFT JOIN employees e ON e.employee_id = lr.employee_id
                 WHERE LOWER(lr.status) = 'pending'
                 ORDER BY lr.created_at DESC
                 LIMIT 300";
    $leaveResult = $conn->query($leaveSql);
    if ($leaveResult) {
        while ($row = $leaveResult->fetch_assoc()) {
            $createdAt = (string)($row['created_at'] ?? date('Y-m-d H:i:s'));
            $dueAt = date('Y-m-d H:i:s', strtotime($createdAt) + ($slaLeaveHours * 3600));
            $employeeName = trim((string)($row['employee_name'] ?? ''));
            if ($employeeName === '') $employeeName = 'Employee #' . intval($row['employee_id'] ?? 0);
            $range = (string)($row['start_date'] ?? '');
            if (!empty($row['end_date']) && $row['end_date'] !== $row['start_date']) {
                $range .= ' to ' . $row['end_date'];
            }

            addApprovalItem(
                $items,
                'leave',
                intval($row['leave_request_id']),
                $employeeName . ' requested ' . strtoupper((string)$row['leave_type']) . ' leave',
                $range,
                $createdAt,
                $dueAt,
                'medium',
                '/leave-requests?request_id=' . intval($row['leave_request_id']),
                [
                    'employee_id' => intval($row['employee_id']),
                    'leave_type' => (string)($row['leave_type'] ?? ''),
                    'employee_role' => (string)($row['employee_role'] ?? ''),
                ]
            );
        }
    }
}

if ($typeFilter === 'all' || $typeFilter === 'overtime') {
    $otSql = "SELECT ot.overtime_request_id,
                     ot.employee_id,
                     ot.work_date,
                     ot.hours_requested,
                     ot.reason,
                     ot.created_at,
                     ot.sla_due_at,
                     CONCAT(e.first_name, ' ', e.last_name) AS employee_name
              FROM overtime_request ot
              LEFT JOIN employees e ON e.employee_id = ot.employee_id
              WHERE LOWER(ot.status) = 'submitted'
              ORDER BY ot.created_at DESC
              LIMIT 300";
    $otResult = $conn->query($otSql);
    if ($otResult) {
        while ($row = $otResult->fetch_assoc()) {
            $createdAt = (string)($row['created_at'] ?? date('Y-m-d H:i:s'));
            $dueAtRaw = trim((string)($row['sla_due_at'] ?? ''));
            $dueAt = $dueAtRaw !== '' ? $dueAtRaw : date('Y-m-d H:i:s', strtotime($createdAt) + ($slaOvertimeHours * 3600));
            $employeeName = trim((string)($row['employee_name'] ?? ''));
            if ($employeeName === '') $employeeName = 'Employee #' . intval($row['employee_id'] ?? 0);
            $hours = number_format((float)($row['hours_requested'] ?? 0), 2);

            addApprovalItem(
                $items,
                'overtime',
                intval($row['overtime_request_id']),
                $employeeName . ' requested overtime (' . $hours . ' hrs)',
                'Work date: ' . (string)($row['work_date'] ?? ''),
                $createdAt,
                $dueAt,
                floatval($row['hours_requested'] ?? 0) >= 6 ? 'high' : 'medium',
                '/overtime-requests?request_id=' . intval($row['overtime_request_id']),
                [
                    'employee_id' => intval($row['employee_id']),
                    'hours_requested' => floatval($row['hours_requested'] ?? 0),
                ]
            );
        }
    }
}

if ($typeFilter === 'all' || $typeFilter === 'payslip_dispute') {
    $disputeSql = "SELECT pd.dispute_id,
                          pd.employee_id,
                          pd.payroll_id,
                          pd.issue_type,
                          pd.priority,
                          pd.status,
                          pd.created_at,
                          pd.sla_due_at,
                          p.pay_period_start,
                          p.pay_period_end,
                          CONCAT(e.first_name, ' ', e.last_name) AS employee_name
                   FROM payslip_dispute pd
                   INNER JOIN payroll p ON p.id = pd.payroll_id
                   LEFT JOIN employees e ON e.employee_id = pd.employee_id
                   WHERE LOWER(pd.status) IN ('submitted', 'in_review')
                   ORDER BY pd.created_at DESC
                   LIMIT 300";
    $disputeResult = $conn->query($disputeSql);
    if ($disputeResult) {
        while ($row = $disputeResult->fetch_assoc()) {
            $createdAt = (string)($row['created_at'] ?? date('Y-m-d H:i:s'));
            $dueAtRaw = trim((string)($row['sla_due_at'] ?? ''));
            $dueAt = $dueAtRaw !== '' ? $dueAtRaw : date('Y-m-d H:i:s', strtotime($createdAt) + ($slaDisputeHours * 3600));
            $employeeName = trim((string)($row['employee_name'] ?? ''));
            if ($employeeName === '') $employeeName = 'Employee #' . intval($row['employee_id'] ?? 0);
            $period = (string)($row['pay_period_start'] ?? '') . ' - ' . (string)($row['pay_period_end'] ?? '');
            $priority = strtolower(trim((string)($row['priority'] ?? 'medium')));
            if (!in_array($priority, ['low', 'medium', 'high'], true)) $priority = 'medium';

            addApprovalItem(
                $items,
                'payslip_dispute',
                intval($row['dispute_id']),
                $employeeName . ' filed a payslip dispute (' . strtoupper((string)$row['issue_type']) . ')',
                'Pay period: ' . $period,
                $createdAt,
                $dueAt,
                $priority,
                '/payslip-disputes?dispute_id=' . intval($row['dispute_id']),
                [
                    'employee_id' => intval($row['employee_id']),
                    'payroll_id' => intval($row['payroll_id']),
                    'issue_type' => (string)($row['issue_type'] ?? ''),
                    'status' => (string)($row['status'] ?? ''),
                ]
            );
        }
    }
}

if (!empty($items)) {
    usort($items, function ($a, $b) {
        $aDue = strtotime((string)($a['sla_due_at'] ?? '')) ?: PHP_INT_MAX;
        $bDue = strtotime((string)($b['sla_due_at'] ?? '')) ?: PHP_INT_MAX;
        if ($aDue === $bDue) {
            $aSubmitted = strtotime((string)($a['submitted_at'] ?? '')) ?: 0;
            $bSubmitted = strtotime((string)($b['submitted_at'] ?? '')) ?: 0;
            return $bSubmitted <=> $aSubmitted;
        }
        return $aDue <=> $bDue;
    });
}

if ($slaFilter !== 'all') {
    $items = array_values(array_filter($items, function ($item) use ($slaFilter) {
        return strtolower((string)($item['sla_status'] ?? '')) === $slaFilter;
    }));
}

$summary = [
    'total' => count($items),
    'overdue' => 0,
    'due_soon' => 0,
    'on_track' => 0,
    'by_type' => [
        'leave' => 0,
        'overtime' => 0,
        'payslip_dispute' => 0,
    ],
];

foreach ($items as $item) {
    $status = strtolower((string)($item['sla_status'] ?? 'on_track'));
    if (isset($summary[$status])) {
        $summary[$status] += 1;
    }
    $type = strtolower((string)($item['type'] ?? ''));
    if (isset($summary['by_type'][$type])) {
        $summary['by_type'][$type] += 1;
    }
}

sendResponse(true, [
    'summary' => $summary,
    'items' => $items,
], 'Approval inbox retrieved successfully');

closeDBConnection($conn);
?>
