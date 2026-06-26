<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';
setCORSHeaders();

$conn = getDBConnection();
requireAuth();

try {
    // Get optional parameters
    $userId = isset($_GET['user_id']) ? (int)$_GET['user_id'] : null;
    $period = isset($_GET['period']) ? $_GET['period'] : 'week';
    
    // Determine date range based on period
    $today = new DateTime('today');
    $start = clone $today;
    
    switch ($period) {
        case 'month':
            $start->modify('-30 days');
            break;
        case 'year':
            $start->modify('-12 months');
            break;
        case 'week':
        default:
            $start->modify('-6 days');
            break;
    }
    
    // Build WHERE clause for user-specific queries
    $userWhere = $userId ? " AND assigned_to = ?" : "";
    
    // Basic counts
    $counts = [
        'total_users' => 0,
        'total_projects' => 0,
        'total_clients' => 0,
        'tasks_total' => 0,
        'tasks_pending' => 0,
        'tasks_in_progress' => 0,
        'tasks_completed' => 0,
        'payroll_pending' => 0,
    ];

    // Total users
    if ($res = $conn->query("SELECT COUNT(*) AS c FROM users")) {
        $row = $res->fetch_assoc();
        $counts['total_users'] = (int)$row['c'];
        $res->close();
    }

    // Total projects
    if ($res = $conn->query("SELECT COUNT(*) AS c FROM projects")) {
        $row = $res->fetch_assoc();
        $counts['total_projects'] = (int)$row['c'];
        $res->close();
    }

    // Total clients (table name is `client` per schema)
    if ($res = $conn->query("SELECT COUNT(*) AS c FROM client")) {
        $row = $res->fetch_assoc();
        $counts['total_clients'] = (int)($row['c'] ?? 0);
        $res->close();
    }

    // Tasks breakdown
    if ($res = $conn->query("SELECT COUNT(*) AS c FROM tasks")) {
        $row = $res->fetch_assoc();
        $counts['tasks_total'] = (int)($row['c'] ?? 0);
        $res->close();
    }

    if ($res = $conn->query("SELECT status, COUNT(*) AS c FROM tasks GROUP BY status")) {
        while ($row = $res->fetch_assoc()) {
            $status = $row['status'] ?? '';
            $c = (int)($row['c'] ?? 0);
            if ($status === 'pending') $counts['tasks_pending'] = $c;
            if ($status === 'in_progress') $counts['tasks_in_progress'] = $c;
            if ($status === 'completed') $counts['tasks_completed'] = $c;
        }
        $res->close();
    }

    // Payroll pending
    if ($res = $conn->query("SELECT COUNT(*) AS c FROM payroll WHERE status IN ('pending')")) {
        $row = $res->fetch_assoc();
        $counts['payroll_pending'] = (int)($row['c'] ?? 0);
        $res->close();
    }

    // Task activity based on selected period (created and completed per day/week/month)
    $labels = [];
    $created = [];
    $completed = [];

    // Generate date labels based on period
    if ($period === 'year') {
        // For year view, show monthly data
        for ($m = 0; $m < 12; $m++) {
            $date = (clone $today)->modify("-{$m} months");
            $key = $date->format('Y-m');
            $labels[$key] = 0;
            $created[$key] = 0;
            $completed[$key] = 0;
        }
        ksort($labels);
        ksort($created);
        ksort($completed);
    } else {
        // For week/month view, show daily data
        for ($d = clone $start; $d <= $today; $d->modify('+1 day')) {
            $key = $d->format('Y-m-d');
            $labels[$key] = 0;
            $created[$key] = 0;
            $completed[$key] = 0;
        }
    }

    // Created per day/month
    $dateFormat = $period === 'year' ? '%Y-%m' : '%Y-%m-%d';
    $sqlCreated = "SELECT DATE_FORMAT(created_at, '{$dateFormat}') as d, COUNT(*) as c 
                   FROM tasks 
                   WHERE created_at >= ?{$userWhere} 
                   GROUP BY DATE_FORMAT(created_at, '{$dateFormat}')";
    
    if ($stmt = $conn->prepare($sqlCreated)) {
        $startStr = $start->format('Y-m-d 00:00:00');
        if ($userId) {
            $stmt->bind_param('si', $startStr, $userId);
        } else {
            $stmt->bind_param('s', $startStr);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $k = $row['d'];
            if (isset($created[$k])) $created[$k] = (int)$row['c'];
        }
        $stmt->close();
    }

    // Completed per day/month (approximate using updated_at when status is completed)
    $sqlCompleted = "SELECT DATE_FORMAT(updated_at, '{$dateFormat}') as d, COUNT(*) as c 
                     FROM tasks 
                     WHERE status = 'completed' AND updated_at >= ?{$userWhere} 
                     GROUP BY DATE_FORMAT(updated_at, '{$dateFormat}')";
    
    if ($stmt = $conn->prepare($sqlCompleted)) {
        $startStr = $start->format('Y-m-d 00:00:00');
        if ($userId) {
            $stmt->bind_param('si', $startStr, $userId);
        } else {
            $stmt->bind_param('s', $startStr);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $k = $row['d'];
            if (isset($completed[$k])) $completed[$k] = (int)$row['c'];
        }
        $stmt->close();
    }

    // Compose response
    $trend = [];
    foreach ($labels as $d => $_) {
        $trend[] = [
            'date' => $d,
            'created' => $created[$d],
            'completed' => $completed[$d],
        ];
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'counts' => $counts,
            'trend' => $trend
        ]
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
} finally {
    closeDBConnection($conn);
}
