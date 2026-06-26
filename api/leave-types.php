<?php
/**
 * Leave Types API
 * Handles CRUD operations for configurable leave types.
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensureLeaveTypeStorage($conn);

switch ($method) {
    case 'GET':
        requireAuth();
        handleGet($conn);
        break;
    case 'POST':
        requireRole(['admin']);
        handlePost($conn);
        break;
    case 'PUT':
        requireRole(['admin']);
        handlePut($conn);
        break;
    case 'DELETE':
        requireRole(['admin']);
        handleDelete($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

function getDefaultLeaveTypeSeeds() {
    return [
        ['type_key' => 'sick', 'type_name' => 'Sick'],
        ['type_key' => 'vacation', 'type_name' => 'Vacation'],
        ['type_key' => 'emergency', 'type_name' => 'Emergency'],
        ['type_key' => 'maternity', 'type_name' => 'Maternity'],
        ['type_key' => 'paternity', 'type_name' => 'Paternity'],
        ['type_key' => 'unpaid', 'type_name' => 'Unpaid'],
    ];
}

function normalizeLeaveTypeKey($value) {
    $raw = strtolower(trim((string)$value));
    if ($raw === '') return '';
    $raw = preg_replace('/[^a-z0-9]+/', '_', $raw);
    $raw = trim((string)$raw, '_');
    if ($raw === '') return '';
    if (strlen($raw) > 100) {
        $raw = substr($raw, 0, 100);
        $raw = rtrim($raw, '_');
    }
    return $raw;
}

function ensureLeaveTypeColumnIsVarchar($conn, $table, $column) {
    $dbName = DB_NAME;
    $checkSql = "SELECT DATA_TYPE, COLUMN_TYPE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
                 LIMIT 1";
    $checkStmt = $conn->prepare($checkSql);
    if (!$checkStmt) {
        sendError('Failed to validate leave type schema.', 500);
    }
    $checkStmt->bind_param('sss', $dbName, $table, $column);
    $checkStmt->execute();
    $col = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$col) return;

    $dataType = strtolower((string)($col['DATA_TYPE'] ?? ''));
    $columnType = strtolower((string)($col['COLUMN_TYPE'] ?? ''));
    if ($dataType === 'enum' || strpos($columnType, 'enum(') === 0) {
        $alterSql = "ALTER TABLE `$table` MODIFY COLUMN `$column` VARCHAR(100) NOT NULL";
        if (!$conn->query($alterSql)) {
            sendError('Failed to upgrade leave type schema on ' . $table . ': ' . $conn->error, 500);
        }
    }
}

function ensureLeaveTypeStorage($conn) {
    $createSql = "CREATE TABLE IF NOT EXISTS leave_type (
                    leave_type_id INT AUTO_INCREMENT PRIMARY KEY,
                    type_key VARCHAR(100) NOT NULL UNIQUE,
                    type_name VARCHAR(120) NOT NULL UNIQUE,
                    description TEXT NULL,
                    is_active TINYINT(1) NOT NULL DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_leave_type_active (is_active)
                  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    if (!$conn->query($createSql)) {
        sendError('Failed to initialize leave type storage: ' . $conn->error, 500);
    }

    ensureLeaveTypeColumnIsVarchar($conn, 'leave_request', 'leave_type');
    ensureLeaveTypeColumnIsVarchar($conn, 'leave_balance', 'leave_type');

    $insertSql = "INSERT INTO leave_type (type_key, type_name, description, is_active)
                  VALUES (?, ?, '', 1)
                  ON DUPLICATE KEY UPDATE type_name = VALUES(type_name)";
    $stmt = $conn->prepare($insertSql);
    if (!$stmt) {
        sendError('Failed to initialize default leave types.', 500);
    }
    foreach (getDefaultLeaveTypeSeeds() as $seed) {
        $key = (string)$seed['type_key'];
        $name = (string)$seed['type_name'];
        $stmt->bind_param('ss', $key, $name);
        $stmt->execute();
    }
    $stmt->close();
}

function handleGet($conn) {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $sql = "SELECT leave_type_id, type_key, type_name, description, is_active, created_at, updated_at
            FROM leave_type
            WHERE 1=1";
    $params = [];
    $types = '';

    if ($id > 0) {
        $sql .= " AND leave_type_id = ?";
        $params[] = $id;
        $types .= 'i';
    }

    if (isset($_GET['is_active']) && $_GET['is_active'] !== '') {
        $sql .= " AND is_active = ?";
        $params[] = intval($_GET['is_active']) ? 1 : 0;
        $types .= 'i';
    }

    if (!empty($_GET['search'])) {
        $search = '%' . sanitizeInput($_GET['search']) . '%';
        $sql .= " AND (type_name LIKE ? OR type_key LIKE ? OR description LIKE ?)";
        $params[] = $search;
        $params[] = $search;
        $params[] = $search;
        $types .= 'sss';
    }

    $sql .= " ORDER BY type_name ASC";

    if (!empty($params)) {
        $stmt = $conn->prepare($sql);
        if (!$stmt) sendError('Failed to prepare query', 500);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql);
    }

    if (!$result) sendError('Failed to retrieve leave types', 500);

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['is_active'] = intval($row['is_active']);
        $rows[] = $row;
    }

    if ($id > 0) {
        if (!empty($rows)) {
            sendResponse(true, $rows[0], 'Leave type retrieved successfully');
        }
        sendError('Leave type not found', 404);
    }

    sendResponse(true, $rows, 'Leave types retrieved successfully');
}

function handlePost($conn) {
    $data = getJSONInput();

    $required = ['type_name'];
    $missing = validateRequiredFields($data, $required);
    if ($missing) sendError('Missing required fields: ' . implode(', ', $missing), 400);

    $typeName = trim((string)($data['type_name'] ?? ''));
    $typeName = sanitizeInput($typeName);
    if ($typeName === '') sendError('Type name is required', 400);
    if (strlen($typeName) > 120) sendError('Type name is too long (max 120 characters)', 400);

    $typeKeyRaw = trim((string)($data['type_key'] ?? ''));
    $typeKey = normalizeLeaveTypeKey($typeKeyRaw !== '' ? $typeKeyRaw : $typeName);
    if ($typeKey === '') sendError('Unable to generate a valid leave type key', 400);

    $description = sanitizeInput(trim((string)($data['description'] ?? '')));

    $sql = "INSERT INTO leave_type (type_key, type_name, description, is_active)
            VALUES (?, ?, ?, 1)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare insert', 500);
    $stmt->bind_param('sss', $typeKey, $typeName, $description);

    if ($stmt->execute()) {
        sendResponse(true, ['leave_type_id' => $conn->insert_id], 'Leave type created successfully', 201);
    }

    if ($conn->errno === 1062) sendError('Leave type name or key already exists', 409);
    sendError('Failed to create leave type: ' . $conn->error, 500);
}

function handlePut($conn) {
    $data = getJSONInput();
    if (!isset($data['leave_type_id'])) sendError('Leave type ID is required', 400);

    $id = intval($data['leave_type_id']);
    if ($id <= 0) sendError('Invalid leave type ID', 400);

    $check = $conn->prepare("SELECT leave_type_id FROM leave_type WHERE leave_type_id = ? LIMIT 1");
    if (!$check) sendError('Failed to prepare existence check', 500);
    $check->bind_param('i', $id);
    $check->execute();
    if ($check->get_result()->num_rows === 0) sendError('Leave type not found', 404);

    $updates = [];
    $params = [];
    $types = '';

    if (array_key_exists('type_name', $data)) {
        $typeName = sanitizeInput(trim((string)$data['type_name']));
        if ($typeName === '') sendError('Type name cannot be empty', 400);
        if (strlen($typeName) > 120) sendError('Type name is too long (max 120 characters)', 400);
        $updates[] = "type_name = ?";
        $params[] = $typeName;
        $types .= 's';
    }
    if (array_key_exists('description', $data)) {
        $updates[] = "description = ?";
        $params[] = sanitizeInput(trim((string)$data['description']));
        $types .= 's';
    }
    if (array_key_exists('is_active', $data)) {
        $updates[] = "is_active = ?";
        $params[] = !empty($data['is_active']) ? 1 : 0;
        $types .= 'i';
    }

    if (empty($updates)) sendError('No fields to update', 400);

    $params[] = $id;
    $types .= 'i';
    $sql = "UPDATE leave_type SET " . implode(', ', $updates) . " WHERE leave_type_id = ?";
    $stmt = $conn->prepare($sql);
    if (!$stmt) sendError('Failed to prepare update', 500);
    $stmt->bind_param($types, ...$params);

    if ($stmt->execute()) {
        sendResponse(true, null, 'Leave type updated successfully');
    }

    if ($conn->errno === 1062) sendError('Leave type name already exists', 409);
    sendError('Failed to update leave type: ' . $conn->error, 500);
}

function handleDelete($conn) {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id <= 0) sendError('Leave type ID is required', 400);

    $permanent = isset($_GET['permanent']) && intval($_GET['permanent']) === 1;

    $check = $conn->prepare("SELECT leave_type_id, type_key, type_name FROM leave_type WHERE leave_type_id = ? LIMIT 1");
    if (!$check) sendError('Failed to prepare existence check', 500);
    $check->bind_param('i', $id);
    $check->execute();
    $row = $check->get_result()->fetch_assoc();
    if (!$row) sendError('Leave type not found', 404);

    $typeKey = (string)($row['type_key'] ?? '');
    if ($typeKey === '') sendError('Invalid leave type key', 500);

    if ($permanent) {
        $useStmt = $conn->prepare(
            "SELECT (
                (SELECT COUNT(*) FROM leave_request WHERE leave_type = ?)
                +
                (SELECT COUNT(*) FROM leave_balance WHERE leave_type = ?)
            ) AS total_refs"
        );
        if (!$useStmt) sendError('Failed to verify leave type usage', 500);
        $useStmt->bind_param('ss', $typeKey, $typeKey);
        $useStmt->execute();
        $usage = $useStmt->get_result()->fetch_assoc();
        $useStmt->close();
        $totalRefs = intval($usage['total_refs'] ?? 0);
        if ($totalRefs > 0) {
            sendError('Cannot permanently delete a leave type that is already used. Archive it instead.', 409);
        }

        $stmt = $conn->prepare("DELETE FROM leave_type WHERE leave_type_id = ?");
        if (!$stmt) sendError('Failed to prepare delete', 500);
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) sendResponse(true, null, 'Leave type deleted permanently');
        sendError('Failed to delete leave type: ' . $conn->error, 500);
    }

    $stmt = $conn->prepare("UPDATE leave_type SET is_active = 0 WHERE leave_type_id = ?");
    if (!$stmt) sendError('Failed to prepare archive update', 500);
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) sendResponse(true, null, 'Leave type archived successfully');
    sendError('Failed to archive leave type: ' . $conn->error, 500);
}

closeDBConnection($conn);
?>
