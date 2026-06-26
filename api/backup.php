<?php
/**
 * System Backup API
 * Admin-only endpoints for database backup management
 *
 * POST ?action=create          — create a new full DB backup (.sql)
 * GET  ?action=list            — list existing backups
 * GET  ?action=download&file=  — download a backup file
 * POST ?action=delete          — delete a backup file
 * GET  ?action=get_schedule    — get auto-backup schedule
 * POST ?action=set_schedule    — save auto-backup schedule
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn   = getDBConnection();

// Admin only
requireAuth();
requireRole(['admin']);

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'create':
        if ($method !== 'POST') sendError('Method not allowed', 405);
        handleCreateBackup($conn);
        break;
    case 'import':
        if ($method !== 'POST') sendError('Method not allowed', 405);
        handleImportBackup($conn);
        break;
    case 'list':
        if ($method !== 'GET') sendError('Method not allowed', 405);
        handleListBackups();
        break;
    case 'download':
        if ($method !== 'GET') sendError('Method not allowed', 405);
        handleDownloadBackup();
        break;
    case 'delete':
        if ($method !== 'POST') sendError('Method not allowed', 405);
        handleDeleteBackup($conn);
        break;
    case 'get_schedule':
        if ($method !== 'GET') sendError('Method not allowed', 405);
        handleGetSchedule($conn);
        break;
    case 'set_schedule':
        if ($method !== 'POST') sendError('Method not allowed', 405);
        handleSetSchedule($conn);
        break;
    default:
        sendError('Invalid action', 400);
}

closeDBConnection($conn);

// ---- Helpers ----

function getBackupDir() {
    $dir = __DIR__ . '/../backups';
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return realpath($dir);
}

function getBackupRetentionLimit() {
    $raw = getenv('BACKUP_MAX_FILES');
    if ($raw === false || trim((string)$raw) === '') {
        return 10;
    }

    $limit = (int)$raw;
    if ($limit < 1) {
        return 10;
    }

    return min(500, $limit);
}

function getBackupImportLimitBytes() {
    $raw = getenv('BACKUP_IMPORT_MAX_BYTES');
    if ($raw === false || trim((string)$raw) === '') {
        return 50 * 1024 * 1024; // 50 MB default
    }

    $limit = (int)$raw;
    if ($limit < 1) {
        return 50 * 1024 * 1024;
    }

    return min(1024 * 1024 * 1024, $limit); // cap at 1 GB
}

function describeUploadError($errorCode) {
    switch ((int)$errorCode) {
        case UPLOAD_ERR_OK:
            return '';
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return 'Uploaded backup file exceeds the allowed size limit.';
        case UPLOAD_ERR_PARTIAL:
            return 'Backup upload was interrupted. Please try again.';
        case UPLOAD_ERR_NO_FILE:
            return 'No backup file was uploaded.';
        case UPLOAD_ERR_NO_TMP_DIR:
            return 'Server temporary folder is missing.';
        case UPLOAD_ERR_CANT_WRITE:
            return 'Server failed to write uploaded backup file.';
        case UPLOAD_ERR_EXTENSION:
            return 'Backup upload was blocked by a server extension.';
        default:
            return 'Unknown backup upload error.';
    }
}

function pruneOldBackups($backupDir, $keepCount) {
    $result = [
        'deleted' => 0,
        'failed'  => 0,
    ];

    if ($keepCount < 1) {
        return $result;
    }

    $files = glob($backupDir . DIRECTORY_SEPARATOR . 'backup_*.sql');
    if (!$files || count($files) <= $keepCount) {
        return $result;
    }

    usort($files, function ($a, $b) {
        return filemtime($b) - filemtime($a);
    });

    $toDelete = array_slice($files, $keepCount);
    foreach ($toDelete as $file) {
        if (@unlink($file)) {
            $result['deleted']++;
        } else {
            $result['failed']++;
        }
    }

    return $result;
}

/**
 * Pure-PHP full database dump (no mysqldump dependency)
 */
function handleCreateBackup($conn) {
    $backupDir = getBackupDir();
    $timestamp = date('Y-m-d_H-i-s');
    $filename  = 'backup_' . DB_NAME . '_' . $timestamp . '.sql';
    $filepath  = $backupDir . DIRECTORY_SEPARATOR . $filename;

    $sql = "-- LLB Accountants System Backup\n";
    $sql .= "-- Database: " . DB_NAME . "\n";
    $sql .= "-- Generated: " . date('Y-m-d H:i:s') . "\n";
    $sql .= "-- =====================================================\n\n";
    $sql .= "SET FOREIGN_KEY_CHECKS=0;\n";
    $sql .= "SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n";
    $sql .= "SET NAMES utf8mb4;\n\n";

    // Get all tables
    $tables = [];
    $result = $conn->query("SHOW TABLES");
    while ($row = $result->fetch_row()) {
        $tables[] = $row[0];
    }

    foreach ($tables as $table) {
        // Table structure
        $sql .= "-- -----------------------------------------------\n";
        $sql .= "-- Table: `$table`\n";
        $sql .= "-- -----------------------------------------------\n";
        $sql .= "DROP TABLE IF EXISTS `$table`;\n";

        $createResult = $conn->query("SHOW CREATE TABLE `$table`");
        $createRow = $createResult->fetch_row();
        $sql .= $createRow[1] . ";\n\n";

        // Table data
        $dataResult = $conn->query("SELECT * FROM `$table`");
        if ($dataResult && $dataResult->num_rows > 0) {
            $fields = $dataResult->fetch_fields();
            while ($dataRow = $dataResult->fetch_row()) {
                $values = [];
                foreach ($dataRow as $i => $value) {
                    if ($value === null) {
                        $values[] = 'NULL';
                    } else {
                        $values[] = "'" . $conn->real_escape_string($value) . "'";
                    }
                }
                $sql .= "INSERT INTO `$table` VALUES (" . implode(', ', $values) . ");\n";
            }
            $sql .= "\n";
        }
    }

    $sql .= "SET FOREIGN_KEY_CHECKS=1;\n";

    // Write file
    if (file_put_contents($filepath, $sql) === false) {
        sendError('Failed to write backup file.');
    }

    $user_id = (int)$_SESSION['user_id'];
    $retentionLimit = getBackupRetentionLimit();
    $prune = pruneOldBackups($backupDir, $retentionLimit);

    // Log activity
    logActivity($conn, $user_id, 'create_backup', "Created database backup: $filename", 'backup');
    if ($prune['deleted'] > 0 || $prune['failed'] > 0) {
        logActivity(
            $conn,
            $user_id,
            'prune_backups',
            "Auto-pruned old backups (deleted={$prune['deleted']}, failed={$prune['failed']}, keep_latest={$retentionLimit})",
            'backup'
        );
    }

    sendResponse(true, [
        'filename'   => $filename,
        'size'       => filesize($filepath),
        'created_at' => date('Y-m-d H:i:s'),
        'retention_limit' => $retentionLimit,
        'auto_pruned' => $prune['deleted'],
    ], 'Backup created successfully.');
}

function executeSqlFileStatements($conn, $filePath) {
    $handle = fopen($filePath, 'rb');
    if ($handle === false) {
        return [
            'success' => false,
            'message' => 'Unable to open SQL file for import.',
            'executed' => 0,
        ];
    }

    $statement = '';
    $executed = 0;
    $lineNumber = 0;

    while (($line = fgets($handle)) !== false) {
        $lineNumber++;
        $trimmed = trim($line);

        if ($statement === '') {
            $trimmedLeft = ltrim($line);
            if ($trimmed === '') {
                continue;
            }
            if (strpos($trimmedLeft, '--') === 0 || strpos($trimmedLeft, '#') === 0) {
                continue;
            }
            if (stripos($trimmedLeft, 'DELIMITER ') === 0) {
                continue;
            }
        }

        $statement .= $line;

        if (preg_match('/;\s*$/', $trimmed) !== 1) {
            continue;
        }

        $sql = trim($statement);
        $statement = '';
        if ($sql === '') {
            continue;
        }

        if (!$conn->query($sql)) {
            fclose($handle);
            $preview = preg_replace('/\s+/', ' ', $sql);
            return [
                'success' => false,
                'message' => $conn->error ?: 'SQL execution failed.',
                'executed' => $executed,
                'line' => $lineNumber,
                'statement_preview' => substr((string)$preview, 0, 180),
            ];
        }

        $executed++;
    }

    if (!feof($handle)) {
        fclose($handle);
        return [
            'success' => false,
            'message' => 'Failed while reading SQL file.',
            'executed' => $executed,
        ];
    }

    fclose($handle);

    $remaining = trim($statement);
    if ($remaining !== '') {
        if (!$conn->query($remaining)) {
            $preview = preg_replace('/\s+/', ' ', $remaining);
            return [
                'success' => false,
                'message' => $conn->error ?: 'SQL execution failed.',
                'executed' => $executed,
                'statement_preview' => substr((string)$preview, 0, 180),
            ];
        }
        $executed++;
    }

    return [
        'success' => true,
        'executed' => $executed,
    ];
}

function handleImportBackup($conn) {
    $data = getJSONInput();
    $requestedFilename = trim((string)($data['filename'] ?? ''));
    $uploadedFile = $_FILES['backup_file'] ?? null;
    $sourcePath = '';
    $sourceName = '';
    $sourceType = '';
    $sizeBytes = 0;
    $limitBytes = getBackupImportLimitBytes();

    if (is_array($uploadedFile) && (int)($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $uploadError = (int)($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($uploadError !== UPLOAD_ERR_OK) {
            sendError(describeUploadError($uploadError), 400);
        }

        $originalName = basename((string)($uploadedFile['name'] ?? 'backup.sql'));
        if (!preg_match('/\.sql$/i', $originalName)) {
            sendError('Only .sql backup files are allowed for import.', 400);
        }

        $sizeBytes = (int)($uploadedFile['size'] ?? 0);
        if ($sizeBytes <= 0) {
            sendError('Uploaded backup file is empty.', 400);
        }
        if ($sizeBytes > $limitBytes) {
            sendError("Uploaded backup exceeds limit of {$limitBytes} bytes.", 400);
        }

        $tmpPath = (string)($uploadedFile['tmp_name'] ?? '');
        if ($tmpPath === '' || !is_uploaded_file($tmpPath)) {
            sendError('Uploaded backup file is invalid.', 400);
        }

        $sourcePath = $tmpPath;
        $sourceName = $originalName;
        $sourceType = 'upload';
    } elseif ($requestedFilename !== '') {
        if (!preg_match('/^backup_[\w\-]+\.sql$/', $requestedFilename)) {
            sendError('Invalid backup filename.', 400);
        }

        $candidate = getBackupDir() . DIRECTORY_SEPARATOR . $requestedFilename;
        if (!file_exists($candidate)) {
            sendError('Backup file not found.', 404);
        }

        $sizeBytes = (int)filesize($candidate);
        if ($sizeBytes <= 0) {
            sendError('Selected backup file is empty.', 400);
        }
        if ($sizeBytes > $limitBytes) {
            sendError("Selected backup exceeds limit of {$limitBytes} bytes.", 400);
        }

        $sourcePath = $candidate;
        $sourceName = $requestedFilename;
        $sourceType = 'stored';
    } else {
        sendError('No backup file provided for import.', 400);
    }

    @set_time_limit(0);
    $conn->query("SET FOREIGN_KEY_CHECKS=0");
    $result = executeSqlFileStatements($conn, $sourcePath);
    $conn->query("SET FOREIGN_KEY_CHECKS=1");

    if (!$result['success']) {
        $message = 'Backup import failed';
        if (!empty($result['message'])) {
            $message .= ': ' . $result['message'];
        }
        if (!empty($result['line'])) {
            $message .= ' (near line ' . (int)$result['line'] . ')';
        }

        sendError($message, 500, [
            'executed_statements' => (int)($result['executed'] ?? 0),
            'statement_preview' => $result['statement_preview'] ?? null,
        ]);
    }

    $user_id = (int)$_SESSION['user_id'];
    logActivity(
        $conn,
        $user_id,
        'import_backup',
        "Imported backup ($sourceType): $sourceName; statements=" . (int)$result['executed'],
        'backup'
    );

    sendResponse(true, [
        'source' => $sourceName,
        'source_type' => $sourceType,
        'size' => $sizeBytes,
        'statements_executed' => (int)$result['executed'],
        'imported_at' => date('Y-m-d H:i:s'),
    ], 'Backup imported successfully.');
}

function handleListBackups() {
    $backupDir = getBackupDir();
    $files = glob($backupDir . DIRECTORY_SEPARATOR . 'backup_*.sql');
    $backups = [];

    if ($files) {
        // Sort newest first
        usort($files, function ($a, $b) {
            return filemtime($b) - filemtime($a);
        });

        foreach ($files as $file) {
            $backups[] = [
                'filename'   => basename($file),
                'size'       => filesize($file),
                'created_at' => date('Y-m-d H:i:s', filemtime($file)),
            ];
        }
    }

    sendResponse(true, $backups, 'Backups listed.');
}

function handleDownloadBackup() {
    $filename = $_GET['file'] ?? '';
    if (!$filename || !preg_match('/^backup_[\w\-]+\.sql$/', $filename)) {
        sendError('Invalid filename.', 400);
    }

    $filepath = getBackupDir() . DIRECTORY_SEPARATOR . $filename;
    if (!file_exists($filepath)) {
        sendError('Backup file not found.', 404);
    }

    // Stream the file
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($filepath));
    header_remove('Content-Type'); // remove JSON header from setCORSHeaders
    header('Content-Type: application/octet-stream');
    readfile($filepath);
    exit;
}

function handleDeleteBackup($conn) {
    $data = getJSONInput();
    $filename = $data['filename'] ?? '';

    if (!$filename || !preg_match('/^backup_[\w\-]+\.sql$/', $filename)) {
        sendError('Invalid filename.', 400);
    }

    $filepath = getBackupDir() . DIRECTORY_SEPARATOR . $filename;
    if (!file_exists($filepath)) {
        sendError('Backup file not found.', 404);
    }

    if (!unlink($filepath)) {
        sendError('Failed to delete backup file.');
    }

    $user_id = (int)$_SESSION['user_id'];
    logActivity($conn, $user_id, 'delete_backup', "Deleted backup: $filename", 'backup');

    sendResponse(true, null, 'Backup deleted.');
}

function handleGetSchedule($conn) {
    $keys = ['backup_frequency', 'backup_time', 'backup_day_of_week', 'backup_day_of_month'];
    $placeholders = implode(',', array_fill(0, count($keys), '?'));
    $types = str_repeat('s', count($keys));

    $sql  = "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$keys);
    $stmt->execute();
    $result = $stmt->get_result();

    $schedule = [
        'backup_frequency'     => 'off',
        'backup_time'          => '02:00',
        'backup_day_of_week'   => '0',
        'backup_day_of_month'  => '1',
    ];
    while ($row = $result->fetch_assoc()) {
        $schedule[$row['setting_key']] = $row['setting_value'];
    }
    $stmt->close();

    sendResponse(true, $schedule, 'Schedule retrieved.');
}

function handleSetSchedule($conn) {
    $data = getJSONInput();
    $allowed = ['backup_frequency', 'backup_time', 'backup_day_of_week', 'backup_day_of_month'];

    foreach ($allowed as $key) {
        if (!isset($data[$key])) continue;
        $val = (string)$data[$key];

        $stmt = $conn->prepare(
            "INSERT INTO settings (setting_key, setting_value, setting_type)
             VALUES (?, ?, 'string')
             ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()"
        );
        $stmt->bind_param('sss', $key, $val, $val);
        $stmt->execute();
        $stmt->close();
    }

    $user_id = (int)$_SESSION['user_id'];
    logActivity($conn, $user_id, 'update_backup_schedule', 'Updated backup schedule: ' . ($data['backup_frequency'] ?? 'off'), 'backup');

    sendResponse(true, null, 'Schedule saved.');
}
?>
