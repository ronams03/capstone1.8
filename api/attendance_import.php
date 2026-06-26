<?php
/**
 * Attendance Import API
 *
 * Handles attendance file upload (.xlsx or .csv), parsing, and auto-generation
 * of draft payroll records.
 */

require_once 'config.php';
require_once 'utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
ensurePhaseOneTables($conn);

try {
    switch ($method) {
        case 'GET':
            requireMinRole('manager');
            handleGetTemplate();
            break;
        case 'POST':
            requireMinRole('manager');
            handleImport($conn);
            break;
        default:
            sendError('Method not allowed', 405);
    }
} catch (Throwable $e) {
    sendError('Attendance import failed: ' . $e->getMessage(), 500);
}

function validateImportPayPeriodDates($payPeriodStart, $payPeriodEnd) {
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

function handleGetTemplate() {
    $action = $_GET['action'] ?? '';

    if ($action !== 'template') {
        sendError('Invalid action. Use ?action=template', 400);
    }

    $tmpFile = tempnam(sys_get_temp_dir(), 'att_') . '.xlsx';
    generateXlsxTemplate($tmpFile);

    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Disposition: attachment; filename="attendance_template.xlsx"');
    header('Content-Length: ' . filesize($tmpFile));
    header('Cache-Control: no-cache, no-store, must-revalidate');
    readfile($tmpFile);
    @unlink($tmpFile);
    exit();
}

function normalizeImportSourceSystem($value) {
    $normalized = strtolower(trim((string)$value));
    if ($normalized === '') return 'payroll_excel';

    $normalized = preg_replace('/[^a-z0-9_-]+/', '_', $normalized);
    $normalized = trim((string)$normalized, '_-');
    return $normalized !== '' ? $normalized : 'payroll_excel';
}

function normalizeIdentityValue($value) {
    $normalized = preg_replace('/\s+/', ' ', trim((string)$value));
    return is_string($normalized) ? $normalized : '';
}

function normalizeIdentityKey($value) {
    $normalized = strtolower(normalizeIdentityValue($value));
    $normalized = preg_replace('/[^a-z0-9]+/', '', $normalized);
    return is_string($normalized) ? $normalized : '';
}

function isSequentialArray($value) {
    if (!is_array($value)) return false;
    return array_keys($value) === range(0, count($value) - 1);
}

function getBase44IdentityConfig() {
    $localConfig = [];
    $localConfigPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'base44.php';
    if (is_file($localConfigPath)) {
        $loaded = require $localConfigPath;
        if (is_array($loaded)) {
            $localConfig = $loaded;
        }
    }

    $appId = trim((string)(getenv('BASE44_APP_ID') ?: ($localConfig['app_id'] ?? '')));
    $apiKey = trim((string)(getenv('BASE44_API_KEY') ?: ($localConfig['api_key'] ?? '')));
    if ($appId === '' || $apiKey === '') {
        return null;
    }

    $entity = trim((string)(getenv('BASE44_EMPLOYEE_IDENTITY_ENTITY') ?: ($localConfig['entity'] ?? 'EmployeeIdentityMap')));
    if ($entity === '') {
        $entity = 'EmployeeIdentityMap';
    }

    return [
        'app_id' => $appId,
        'api_key' => $apiKey,
        'entity' => $entity,
    ];
}

function parseBase44EntityCollection($payload) {
    if (!is_array($payload)) return [];
    if (isSequentialArray($payload)) return $payload;

    foreach (['data', 'items', 'results', 'entities'] as $key) {
        if (isset($payload[$key]) && is_array($payload[$key])) {
            return $payload[$key];
        }
    }

    return [];
}

function base44EntityRequest($method, $path = '', $body = null) {
    $config = getBase44IdentityConfig();
    if ($config === null) {
        return [false, null, 'Base44 identity configuration is missing.'];
    }

    $baseUrl = 'https://base44.app/api/apps/' . rawurlencode($config['app_id']) . '/entities/' . rawurlencode($config['entity']);
    $path = ltrim((string)$path, '/');
    $url = $path !== '' ? $baseUrl . '/' . $path : $baseUrl;

    $headers = [
        'api_key: ' . $config['api_key'],
        'Content-Type: application/json',
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper((string)$method));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        $raw = curl_exec($ch);
        $curlError = curl_error($ch);
        $statusCode = intval(curl_getinfo($ch, CURLINFO_RESPONSE_CODE));
        curl_close($ch);

        if ($raw === false) {
            return [false, null, $curlError !== '' ? $curlError : 'Base44 request failed.'];
        }

        $decoded = json_decode($raw, true);
        if ($statusCode >= 400) {
            $message = is_array($decoded) ? trim((string)($decoded['message'] ?? $decoded['error'] ?? '')) : '';
            if ($message === '') {
                $message = 'Base44 request failed with status ' . $statusCode . '.';
            }
            return [false, $decoded, $message];
        }

        return [true, $decoded, ''];
    }

    $context = stream_context_create([
        'http' => [
            'method' => strtoupper((string)$method),
            'header' => implode("\r\n", $headers),
            'content' => $body !== null ? json_encode($body) : '',
            'timeout' => 15,
            'ignore_errors' => true,
        ],
    ]);

    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) {
        return [false, null, 'Base44 request failed.'];
    }

    $decoded = json_decode($raw, true);
    return [true, $decoded, ''];
}

function fetchBase44IdentityMappings($sourceSystem) {
    $config = getBase44IdentityConfig();
    if ($config === null) {
        return [
            'enabled' => false,
            'error' => '',
            'items' => [],
            'by_code' => [],
            'by_name' => [],
        ];
    }

    [$ok, $payload, $error] = base44EntityRequest('GET');
    if (!$ok) {
        return [
            'enabled' => true,
            'error' => $error,
            'items' => [],
            'by_code' => [],
            'by_name' => [],
        ];
    }

    $items = parseBase44EntityCollection($payload);
    $byCode = [];
    $byName = [];
    $filtered = [];

    foreach ($items as $item) {
        if (!is_array($item)) continue;

        $employeeId = intval($item['employee_id'] ?? 0);
        if ($employeeId <= 0) continue;

        $itemSourceSystem = normalizeImportSourceSystem($item['source_system'] ?? '');
        if ($itemSourceSystem !== $sourceSystem) continue;

        $status = strtolower(trim((string)($item['match_status'] ?? '')));
        if ($status !== '' && !in_array($status, ['confirmed', 'approved', 'matched'], true)) {
            continue;
        }

        $filtered[] = $item;

        $codeKey = normalizeIdentityKey($item['external_employee_code'] ?? '');
        if ($codeKey !== '') {
            if (!isset($byCode[$codeKey])) $byCode[$codeKey] = [];
            $byCode[$codeKey][] = $item;
        }

        $nameKey = normalizeIdentityKey($item['external_employee_name'] ?? '');
        if ($nameKey !== '') {
            if (!isset($byName[$nameKey])) $byName[$nameKey] = [];
            $byName[$nameKey][] = $item;
        }
    }

    return [
        'enabled' => true,
        'error' => '',
        'items' => $filtered,
        'by_code' => $byCode,
        'by_name' => $byName,
    ];
}

function fetchAttendanceImportEmployeeDirectory($conn) {
    $sql = "SELECT e.employee_id,
                   e.employee_date_id,
                   e.first_name,
                   e.last_name,
                   e.salary,
                   e.status,
                   e.position,
                   e.sss_number,
                   e.pagibig_number,
                   e.philhealth_number,
                   e.tin_number,
                   COALESCE(b.branch_name, '') AS branch_name,
                   COALESCE(
                       (SELECT u.role FROM users u WHERE u.employee_id = e.employee_id ORDER BY u.id DESC LIMIT 1),
                       ''
                   ) AS linked_user_role
            FROM employees e
            LEFT JOIN branches b ON b.branch_id = e.branch_id
            WHERE e.status = 'active'";
    $result = $conn->query($sql);
    if (!$result) {
        throw new RuntimeException('Failed to load the active employee directory.');
    }

    $list = [];
    $byId = [];
    $byName = [];
    $byDateId = [];

    while ($row = $result->fetch_assoc()) {
        $firstName = trim((string)($row['first_name'] ?? ''));
        $lastName = trim((string)($row['last_name'] ?? ''));
        $fullName = trim(preg_replace('/\s+/', ' ', $firstName . ' ' . $lastName));
        $normalizedFullName = normalizeIdentityKey($fullName);

        $employee = [
            'employee_id' => intval($row['employee_id'] ?? 0),
            'employee_date_id' => (string)($row['employee_date_id'] ?? ''),
            'name' => $fullName !== '' ? $fullName : ('Employee #' . intval($row['employee_id'] ?? 0)),
            'salary' => floatval($row['salary'] ?? 0),
            'status' => (string)($row['status'] ?? 'active'),
            'position' => (string)($row['position'] ?? ''),
            'branch_name' => (string)($row['branch_name'] ?? ''),
            'linked_user_role' => (string)($row['linked_user_role'] ?? ''),
            'sss_number' => (string)($row['sss_number'] ?? ''),
            'pagibig_number' => (string)($row['pagibig_number'] ?? ''),
            'philhealth_number' => (string)($row['philhealth_number'] ?? ''),
            'tin_number' => (string)($row['tin_number'] ?? ''),
            'normalized_full_name' => $normalizedFullName,
            'normalized_employee_date_id' => normalizeIdentityKey($row['employee_date_id'] ?? ''),
            'normalized_branch' => normalizeIdentityKey($row['branch_name'] ?? ''),
            'normalized_role' => normalizeIdentityKey($row['linked_user_role'] ?? ''),
        ];

        $byId[$employee['employee_id']] = $employee;
        $list[] = $employee;

        if ($normalizedFullName !== '') {
            if (!isset($byName[$normalizedFullName])) $byName[$normalizedFullName] = [];
            $byName[$normalizedFullName][] = $employee;
        }

        $dateIdKey = normalizeIdentityKey($row['employee_date_id'] ?? '');
        if ($dateIdKey !== '') {
            $byDateId[$dateIdKey] = $employee;
        }
    }

    return [
        'list' => $list,
        'by_id' => $byId,
        'by_name' => $byName,
        'by_date_id' => $byDateId,
    ];
}

function describeIdentitySignals($signals) {
    $signals = array_values(array_filter(array_map(
        static fn($signal) => trim((string)$signal),
        is_array($signals) ? $signals : []
    )));
    return implode('; ', $signals);
}

function buildResolvedEmployeeMatch($employee, $method, $label, $confidence, $signals) {
    return [
        'ok' => true,
        'employee' => $employee,
        'method' => $method,
        'label' => $label,
        'confidence' => round(max(0, min(1, floatval($confidence))), 2),
        'signals' => $signals,
        'signal_summary' => describeIdentitySignals($signals),
    ];
}

function resolveBase44MappedEmployee($employeeDirectory, $mappings, $method, $label, $fieldLabel) {
    if (!is_array($mappings) || empty($mappings)) return null;

    $uniqueEmployeeIds = [];
    $bestMapping = null;
    $bestConfidence = -1;

    foreach ($mappings as $mapping) {
        if (!is_array($mapping)) continue;
        $employeeId = intval($mapping['employee_id'] ?? 0);
        if ($employeeId <= 0) continue;
        $uniqueEmployeeIds[$employeeId] = true;

        $confidence = floatval($mapping['confidence_score'] ?? 1);
        if ($bestMapping === null || $confidence > $bestConfidence) {
            $bestMapping = $mapping;
            $bestConfidence = $confidence;
        }
    }

    if ($bestMapping === null || count($uniqueEmployeeIds) !== 1) {
        return null;
    }

    $employeeId = intval($bestMapping['employee_id'] ?? 0);
    if ($employeeId <= 0 || !isset($employeeDirectory['by_id'][$employeeId])) {
        return null;
    }

    $employee = $employeeDirectory['by_id'][$employeeId];
    $signals = [
        'Confirmed Base44 mapping via ' . $fieldLabel,
    ];

    $externalName = normalizeIdentityValue($bestMapping['external_employee_name'] ?? '');
    if ($externalName !== '') {
        $signals[] = 'Mapped external name "' . $externalName . '"';
    }

    $matchedSignals = $bestMapping['matched_signals_json'] ?? null;
    if (is_array($matchedSignals) && !empty($matchedSignals)) {
        $signals[] = 'Base44 signals: ' . describeIdentitySignals($matchedSignals);
    } elseif (is_string($matchedSignals) && trim($matchedSignals) !== '') {
        $signals[] = 'Base44 signals: ' . trim($matchedSignals);
    }

    return buildResolvedEmployeeMatch(
        $employee,
        $method,
        $label,
        max(0.95, min(1, $bestConfidence > 0 ? $bestConfidence : 1)),
        $signals
    );
}

function resolveImportedEmployee($employeeDirectory, $base44Mappings, $sourceSystem, $externalEmployeeCode, $externalEmployeeName, $externalRole, $externalBranch) {
    $externalEmployeeCode = normalizeIdentityValue($externalEmployeeCode);
    $externalEmployeeName = normalizeIdentityValue($externalEmployeeName);
    $externalRole = normalizeIdentityValue($externalRole);
    $externalBranch = normalizeIdentityValue($externalBranch);

    $externalCodeKey = normalizeIdentityKey($externalEmployeeCode);
    $externalNameKey = normalizeIdentityKey($externalEmployeeName);
    $externalRoleKey = normalizeIdentityKey($externalRole);
    $externalBranchKey = normalizeIdentityKey($externalBranch);

    if ($externalCodeKey === '' && $externalNameKey === '') {
        return [
            'ok' => false,
            'message' => 'Missing employee identity. Provide EmployeeID, EmployeeName, or both.',
        ];
    }

    if (!empty($base44Mappings['by_code'][$externalCodeKey])) {
        $resolved = resolveBase44MappedEmployee(
            $employeeDirectory,
            $base44Mappings['by_code'][$externalCodeKey],
            'base44_confirmed_code',
            'Base44 confirmed code mapping',
            'external employee code'
        );
        if ($resolved !== null) {
            return $resolved;
        }
    }

    if ($externalNameKey !== '' && !empty($base44Mappings['by_name'][$externalNameKey])) {
        $resolved = resolveBase44MappedEmployee(
            $employeeDirectory,
            $base44Mappings['by_name'][$externalNameKey],
            'base44_confirmed_name',
            'Base44 confirmed name mapping',
            'external employee name'
        );
        if ($resolved !== null) {
            return $resolved;
        }
    }

    if ($externalCodeKey !== '' && !empty($employeeDirectory['by_date_id'][$externalCodeKey])) {
        $employee = $employeeDirectory['by_date_id'][$externalCodeKey];
        return buildResolvedEmployeeMatch(
            $employee,
            'employee_date_id_match',
            'Biometric ID matched employee_date_id',
            0.98,
            ['External code "' . $externalEmployeeCode . '" matched employee_date_id "' . $employee['employee_date_id'] . '"']
        );
    }

    if ($externalNameKey === '') {
        $message = 'No confirmed Base44 mapping was found for source "' . $sourceSystem . '" and external code "' . $externalEmployeeCode . '".';
        $message .= ' Add EmployeeName to the sheet or confirm a Base44 identity map entry first.';
        return ['ok' => false, 'message' => $message];
    }

    $exactNameMatches = $employeeDirectory['by_name'][$externalNameKey] ?? [];
    $candidates = [];

    foreach ($employeeDirectory['list'] as $employee) {
        $score = 0.0;
        $signals = [];

        if ($employee['normalized_full_name'] !== '') {
            if ($employee['normalized_full_name'] === $externalNameKey) {
                $score += 0.82;
                $signals[] = 'Exact employee name match';
                if (count($exactNameMatches) === 1) {
                    $score += 0.14;
                    $signals[] = 'Unique active employee with this exact name';
                }
            } else {
                similar_text($externalNameKey, $employee['normalized_full_name'], $nameSimilarityPercent);
                $nameSimilarity = max(0, min(1, $nameSimilarityPercent / 100));
                if ($nameSimilarity >= 0.85) {
                    $score += min(0.72, $nameSimilarity * 0.72);
                    $signals[] = 'High name similarity ' . number_format($nameSimilarity, 2);
                } elseif ($nameSimilarity >= 0.75) {
                    $score += min(0.58, $nameSimilarity * 0.58);
                    $signals[] = 'Name similarity ' . number_format($nameSimilarity, 2);
                }
            }
        }

        if ($externalCodeKey !== '') {
            if ($employee['normalized_employee_date_id'] !== '' && $employee['normalized_employee_date_id'] === $externalCodeKey) {
                $score += 0.35;
                $signals[] = 'External code matched employee code';
            }
            if (ctype_digit($externalCodeKey) && intval($externalCodeKey) === intval($employee['employee_id'])) {
                $score += 0.12;
                $signals[] = 'External code matched internal ID (low-trust signal)';
            }
        }

        if ($externalRoleKey !== '' && $employee['normalized_role'] !== '' && $employee['normalized_role'] === $externalRoleKey) {
            $score += 0.08;
            $signals[] = 'Role matched';
        }

        if ($externalBranchKey !== '' && $employee['normalized_branch'] !== '' && $employee['normalized_branch'] === $externalBranchKey) {
            $score += 0.08;
            $signals[] = 'Branch matched';
        }

        if ($score <= 0) continue;

        $candidates[] = [
            'employee' => $employee,
            'score' => min(0.99, $score),
            'signals' => $signals,
        ];
    }

    if (empty($candidates)) {
        return [
            'ok' => false,
            'message' => 'No active employee matched "' . $externalEmployeeName . '" closely enough for safe payroll import.',
        ];
    }

    usort($candidates, static function ($left, $right) {
        $scoreCompare = $right['score'] <=> $left['score'];
        if ($scoreCompare !== 0) return $scoreCompare;
        return $left['employee']['employee_id'] <=> $right['employee']['employee_id'];
    });

    $topCandidate = $candidates[0];
    $secondCandidate = $candidates[1] ?? null;

    if ($topCandidate['score'] < 0.95) {
        return [
            'ok' => false,
            'message' => 'Best match for "' . $externalEmployeeName . '" was ' . $topCandidate['employee']['name']
                . ' with confidence ' . number_format($topCandidate['score'], 2)
                . '. Review and confirm a Base44 identity mapping before importing payroll.',
        ];
    }

    if ($secondCandidate !== null && abs($topCandidate['score'] - $secondCandidate['score']) < 0.05) {
        return [
            'ok' => false,
            'message' => 'Ambiguous identity for "' . $externalEmployeeName . '". Multiple employees scored too closely for safe payroll import.',
        ];
    }

    return buildResolvedEmployeeMatch(
        $topCandidate['employee'],
        'smart_name_match',
        'Smart exact-name match',
        $topCandidate['score'],
        $topCandidate['signals']
    );
}

function handleImport($conn) {
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $errors = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds server upload limit',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds form upload limit',
            UPLOAD_ERR_PARTIAL => 'File was only partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file was uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temp folder on server',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file to disk',
        ];
        $code = $_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE;
        sendError($errors[$code] ?? 'File upload failed', 400);
    }

    $file = $_FILES['file'];
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, ['xls', 'xlsx', 'csv'], true)) {
        sendError('Only .xls, .xlsx, or .csv files are supported. Please use the provided template headers.', 400);
    }

    $payPeriodStart = $_POST['pay_period_start'] ?? '';
    $payPeriodEnd = $_POST['pay_period_end'] ?? '';
    $sourceSystem = normalizeImportSourceSystem($_POST['source_system'] ?? 'payroll_excel');
    if (!$payPeriodStart || !$payPeriodEnd) {
        sendError('Pay period start and end dates are required', 400);
    }
    validateImportPayPeriodDates($payPeriodStart, $payPeriodEnd);

    if ($ext === 'csv') {
        $rows = parseCsv($file['tmp_name']);
    } elseif ($ext === 'xls') {
        $csvContent = parseXls($file['tmp_name']);
        $tmpCsv = tempnam(sys_get_temp_dir(), 'xls_conv_') . '.csv';
        file_put_contents($tmpCsv, $csvContent);
        $rows = parseCsv($tmpCsv);
        @unlink($tmpCsv);
    } else {
        $rows = parseXlsx($file['tmp_name']);
    }
    if (empty($rows)) {
        sendError('The uploaded file contains no data rows', 400);
    }

    $headers = array_map('strtolower', array_map('trim', $rows[0]));
    $requiredColumns = ['daysworked', 'overtimehours', 'lateminutes', 'absentdays'];
    $missingColumns = [];
    foreach ($requiredColumns as $column) {
        if (!in_array($column, $headers, true)) {
            $missingColumns[] = $column;
        }
    }

    if (!empty($missingColumns)) {
        sendError('Missing required columns: ' . implode(', ', $missingColumns) . '. Please use the provided template.', 400);
    }

    $columnMap = array_flip($headers);
    $batchId = 'ATT-' . date('Ymd-His') . '-' . substr(uniqid(), -5);
    $created = 0;
    $skipped = 0;
    $errorsList = [];
    $warningsList = [];
    $identitySummary = [
        'source_system' => $sourceSystem,
        'matched_via_base44' => 0,
        'matched_via_smart_name' => 0,
        'unresolved' => 0,
    ];

    $employeeDirectory = fetchAttendanceImportEmployeeDirectory($conn);
    $base44Mappings = fetchBase44IdentityMappings($sourceSystem);
    if (!empty($base44Mappings['error'])) {
        $warningsList[] = buildBase44ImportWarning($base44Mappings['error']);
    }

    for ($i = 1; $i < count($rows); $i++) {
        $row = $rows[$i];
        $rowNum = $i + 1;

        $externalEmployeeCode = isset($columnMap['employeeid'])
            ? normalizeIdentityValue($row[$columnMap['employeeid']] ?? '')
            : '';
        $externalEmployeeName = isset($columnMap['employeename'])
            ? normalizeIdentityValue($row[$columnMap['employeename']] ?? '')
            : '';
        $externalRole = isset($columnMap['role'])
            ? normalizeIdentityValue($row[$columnMap['role']] ?? '')
            : '';
        $externalBranch = isset($columnMap['branch'])
            ? normalizeIdentityValue($row[$columnMap['branch']] ?? '')
            : '';
        $daysWorked = floatval($row[$columnMap['daysworked']] ?? 0);
        $otHours = floatval($row[$columnMap['overtimehours']] ?? 0);
        $lateMinutes = intval($row[$columnMap['lateminutes']] ?? 0);
        $absentDays = floatval($row[$columnMap['absentdays']] ?? 0);
        $leaveDays = isset($columnMap['leavedays']) ? floatval($row[$columnMap['leavedays']] ?? 0) : 0;

        if ($externalEmployeeCode === '' && $externalEmployeeName === '') {
            $skipped++;
            $identitySummary['unresolved']++;
            $errorsList[] = "Row $rowNum: Missing EmployeeID and EmployeeName";
            continue;
        }

        $resolution = resolveImportedEmployee(
            $employeeDirectory,
            $base44Mappings,
            $sourceSystem,
            $externalEmployeeCode,
            $externalEmployeeName,
            $externalRole,
            $externalBranch
        );

        if (empty($resolution['ok'])) {
            $skipped++;
            $identitySummary['unresolved']++;
            $errorsList[] = 'Row ' . $rowNum . ': ' . trim((string)($resolution['message'] ?? 'Failed to resolve employee identity.'));
            continue;
        }

        $employee = $resolution['employee'];
        $employeeId = intval($employee['employee_id'] ?? 0);
        if ($employeeId <= 0) {
            $skipped++;
            $identitySummary['unresolved']++;
            $errorsList[] = "Row $rowNum: Resolved employee identity was invalid";
            continue;
        }

        if (($resolution['method'] ?? '') === 'smart_name_match') {
            $identitySummary['matched_via_smart_name']++;
        } else {
            $identitySummary['matched_via_base44']++;
        }

        $duplicateStmt = $conn->prepare(
            "SELECT id
             FROM payroll
             WHERE employee_id = ? AND pay_period_start = ? AND pay_period_end = ?"
        );
        if (!$duplicateStmt) {
            throw new RuntimeException('Failed to validate duplicate payroll records.');
        }
        $duplicateStmt->bind_param('iss', $employeeId, $payPeriodStart, $payPeriodEnd);
        $duplicateStmt->execute();
        if ($duplicateStmt->get_result()->num_rows > 0) {
            $skipped++;
            $errorsList[] = "Row $rowNum: Payroll already exists for {$employee['name']} in this pay period";
            $duplicateStmt->close();
            continue;
        }
        $duplicateStmt->close();

        $monthlySalary = floatval($employee['salary']);
        $dailyRate = $monthlySalary / 22;
        $hourlyRate = $dailyRate / 8;

        $basicSalary = $monthlySalary / 2;
        $otRate = round($hourlyRate * 1.25, 2);
        $otPay = round($otHours * $otRate, 2);
        $lateDeduction = round($lateMinutes * ($dailyRate / 480), 2);
        $absenceDeduction = round($absentDays * $dailyRate, 2);
        $grossPay = $basicSalary + $otPay - $lateDeduction - $absenceDeduction;

        $tax = 0;
        $sss = 0;
        $pagibig = 0;
        $philhealth = 0;
        $cashAdvance = 0;
        $laptopLoan = 0;
        $otherDeductions = 0;
        $bonus = 0;
        $clothingAllowance = 0;
        $travelAllowance = 0;
        $salaryAdjustment = 0;

        // Auto-calculate government deductions from settings when available
        $govEligibility = buildGovEligibilityFromEmployee($employee);
        $govDefaults = computeGovernmentDeductionsFromTypes($conn, floatval($basicSalary), $govEligibility);
        if (isset($govDefaults['tax'])) $tax = $govDefaults['tax'];
        if (isset($govDefaults['sss_contribution'])) $sss = $govDefaults['sss_contribution'];
        if (isset($govDefaults['pagibig_contribution'])) $pagibig = $govDefaults['pagibig_contribution'];
        if (isset($govDefaults['philhealth_contribution'])) $philhealth = $govDefaults['philhealth_contribution'];

        $totalDeductions = $tax + $sss + $pagibig + $philhealth + $cashAdvance + $laptopLoan + $otherDeductions;
        $netPay = max(0, $grossPay - $totalDeductions + $bonus);
        $noteParts = [
            'Batch: ' . $batchId,
            'source: ' . $sourceSystem,
            'identity: ' . ($resolution['label'] ?? 'resolved'),
        ];
        if ($externalEmployeeCode !== '') {
            $noteParts[] = 'external code ' . $externalEmployeeCode;
        }
        if ($externalEmployeeName !== '') {
            $noteParts[] = 'external name ' . $externalEmployeeName;
        }
        $signalSummary = trim((string)($resolution['signal_summary'] ?? ''));
        if ($signalSummary !== '') {
            $noteParts[] = $signalSummary;
        }
        $importNote = 'Auto-generated from attendance import (' . implode('; ', $noteParts) . ')';

        $attendanceStmt = $conn->prepare(
            "INSERT INTO attendance_records
                (employee_id, pay_period_start, pay_period_end, days_worked, overtime_hours,
                 late_minutes, absent_days, leave_days, import_batch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        if (!$attendanceStmt) {
            throw new RuntimeException('Failed to prepare attendance import storage.');
        }

        $payrollStmt = $conn->prepare(
            "INSERT INTO payroll
                (employee_id, employee_name, pay_period_start, pay_period_end,
                 basic_salary, overtime_hours, overtime_rate, overtime_pay, bonus,
                 clothing_allowance, travel_allowance, salary_adjustment,
                 late_deduction, absence_deduction,
                 tax, sss_contribution, pagibig_contribution, philhealth_contribution,
                 cash_advance_deduction, cash_advance_manual_deduction, laptop_loan_deduction, other_deductions,
                 gross_pay, total_deductions, net_pay, status, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)"
        );
        if (!$payrollStmt) {
            $attendanceStmt->close();
            throw new RuntimeException('Failed to prepare payroll import storage.');
        }

        $conn->begin_transaction();
        try {
            $attendanceStmt->bind_param(
                'issddidds',
                $employeeId,
                $payPeriodStart,
                $payPeriodEnd,
                $daysWorked,
                $otHours,
                $lateMinutes,
                $absentDays,
                $leaveDays,
                $batchId
            );
            $attendanceStmt->execute();

            $payrollBindTypes = 'isss' . str_repeat('d', 21) . 's';
            $payrollStmt->bind_param(
                $payrollBindTypes,
                $employeeId,
                $employee['name'],
                $payPeriodStart,
                $payPeriodEnd,
                $basicSalary,
                $otHours,
                $otRate,
                $otPay,
                $bonus,
                $clothingAllowance,
                $travelAllowance,
                $salaryAdjustment,
                $lateDeduction,
                $absenceDeduction,
                $tax,
                $sss,
                $pagibig,
                $philhealth,
                $cashAdvance,
                $cashAdvance,
                $laptopLoan,
                $otherDeductions,
                $grossPay,
                $totalDeductions,
                $netPay,
                $importNote
            );
            $payrollStmt->execute();
            $payrollId = intval($conn->insert_id);
            if ($payrollId > 0) {
                syncPayrollCashAdvanceRequests($conn, $payrollId);
            }

            $conn->commit();
            $created++;
        } catch (Throwable $e) {
            $conn->rollback();
            $skipped++;
            $errorsList[] = "Row $rowNum: Failed to create payroll for {$employee['name']}: " . $e->getMessage();
        }

        $attendanceStmt->close();
        $payrollStmt->close();
    }

    $userId = checkAuthentication();
    if ($userId) {
        logActivity(
            $conn,
            $userId,
            'import_attendance',
            "Imported attendance: $created payroll records created (Batch: $batchId; Source: $sourceSystem)",
            'payroll_management'
        );
        logAuditTrail(
            $conn,
            $userId,
            'attendance_import',
            $batchId,
            'import',
            null,
            [
                'batch_id' => $batchId,
                'source_system' => $sourceSystem,
                'records_created' => $created,
                'records_skipped' => $skipped,
                'error_count' => count($errorsList),
                'warning_count' => count($warningsList),
                'identity_summary' => $identitySummary,
            ],
            basename(__FILE__)
        );
    }

    if (!empty($errorsList)) {
        $maxQueue = min(120, count($errorsList));
        for ($idx = 0; $idx < $maxQueue; $idx++) {
            $message = (string)$errorsList[$idx];
            $sourceRecordId = $batchId . '-err-' . ($idx + 1);
            upsertExceptionQueue(
                $conn,
                'attendance_import',
                $sourceRecordId,
                'Attendance import row error',
                $message,
                'high',
                'admin',
                [
                    'batch_id' => $batchId,
                    'error_index' => $idx + 1,
                    'message' => $message,
                ],
                intval($_SESSION['user_id'] ?? 0) > 0 ? intval($_SESSION['user_id'] ?? 0) : null
            );
        }
    }

    sendResponse(
        true,
        [
            'batch_id' => $batchId,
            'source_system' => $sourceSystem,
            'records_created' => $created,
            'records_skipped' => $skipped,
            'errors' => $errorsList,
            'warnings' => $warningsList,
            'identity_summary' => $identitySummary,
        ],
        $created > 0 ? "$created payroll record(s) created as draft" : 'No payroll records were created'
    );
}

function parseCsv($filepath) {
    $handle = @fopen($filepath, 'rb');
    if ($handle === false) {
        sendError('Failed to open the CSV file. Make sure it is a valid .csv file.', 400);
    }

    $delimiter = detectCsvDelimiter($handle);
    rewind($handle);

    $rows = [];
    while (($row = fgetcsv($handle, 0, $delimiter)) !== false) {
        if (!is_array($row)) {
            continue;
        }

        $normalizedRow = [];
        foreach ($row as $index => $value) {
            $cellValue = trim((string)$value);
            if ($index === 0) {
                $cellValue = preg_replace('/^\xEF\xBB\xBF/u', '', $cellValue) ?? $cellValue;
            }
            $normalizedRow[] = $cellValue;
        }

        if (!empty(array_filter($normalizedRow, static fn($value) => $value !== ''))) {
            $rows[] = $normalizedRow;
        }
    }

    fclose($handle);
    return $rows;
}

function detectCsvDelimiter($handle) {
    $candidates = [',', ';', "\t", '|'];
    $scores = [
        ',' => 0,
        ';' => 0,
        "\t" => 0,
        '|' => 0,
    ];

    $sampleCount = 0;
    while (($line = fgets($handle)) !== false && $sampleCount < 6) {
        $line = (string)$line;
        if (trim($line) === '') {
            continue;
        }
        $sampleCount++;

        foreach ($candidates as $candidate) {
            $fields = str_getcsv($line, $candidate);
            $fieldCount = is_array($fields) ? count($fields) : 0;
            if ($fieldCount > $scores[$candidate]) {
                $scores[$candidate] = $fieldCount;
            }
        }
    }

    $best = ',';
    $bestScore = 0;
    foreach ($candidates as $candidate) {
        if ($scores[$candidate] > $bestScore) {
            $best = $candidate;
            $bestScore = $scores[$candidate];
        }
    }

    return $best;
}

function buildBase44ImportWarning($baseError) {
    $baseError = trim((string)$baseError);
    if ($baseError === '') {
        return 'Base44 identity lookup was unavailable. The import used local smart matching only.';
    }

    if (strlen($baseError) > 220) {
        $baseError = substr($baseError, 0, 217) . '...';
    }

    return 'Base44 identity lookup was unavailable: ' . $baseError . '. The import used local smart matching only.';
}

function parseXlsx($filepath) {
    $rows = [];
    $sharedStrings = [];

    $sharedStringsXml = readSpreadsheetEntry($filepath, 'xl/sharedStrings.xml');
    if ($sharedStringsXml !== false) {
        $sharedStringsDoc = new SimpleXMLElement($sharedStringsXml);
        foreach ($sharedStringsDoc->si as $si) {
            $text = '';
            if (isset($si->t)) {
                $text = (string)$si->t;
            } elseif (isset($si->r)) {
                foreach ($si->r as $run) {
                    $text .= (string)$run->t;
                }
            }
            $sharedStrings[] = $text;
        }
    }

    $sheetXml = readSpreadsheetEntry($filepath, 'xl/worksheets/sheet1.xml');
    if ($sheetXml === false) {
        sendError('Failed to open the Excel file. Make sure it is a valid .xlsx file.', 400);
    }

    $sheet = new SimpleXMLElement($sheetXml);
    foreach ($sheet->sheetData->row as $row) {
        $rowData = [];
        foreach ($row->c as $cell) {
            $ref = (string)$cell['r'];
            $colLetter = preg_replace('/[0-9]/', '', $ref);
            $colIndex = columnLetterToIndex($colLetter);

            while (count($rowData) < $colIndex) {
                $rowData[] = '';
            }

            $type = (string)($cell['t'] ?? '');
            if ($type === 's') {
                $value = $sharedStrings[intval((string)$cell->v)] ?? '';
            } elseif ($type === 'inlineStr') {
                $value = (string)$cell->is->t;
            } else {
                $value = (string)($cell->v ?? '');
            }

            $rowData[$colIndex] = $value;
        }

        if (!empty(array_filter($rowData, fn($value) => $value !== ''))) {
            $rows[] = $rowData;
        }
    }

    return $rows;
}

function parseXls($filepath) {
    $scriptPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'scripts' . DIRECTORY_SEPARATOR . 'convert_xls_to_csv.py';
    if (!is_file($scriptPath)) {
        sendError('XLS parser script not found at ' . $scriptPath, 500);
    }

    $escapedFilepath = escapeshellarg($filepath);
    $escapedScript = escapeshellarg($scriptPath);
    $cmd = "python $escapedScript $escapedFilepath 2>&1";

    $output = @shell_exec($cmd);
    if ($output === null || $output === false) {
        sendError('Failed to execute the XLS converter. Make sure Python is installed.', 400);
    }

    $firstLine = strtok($output, "\n");
    if ($firstLine !== false) {
        $decoded = json_decode($firstLine, true);
        if (is_array($decoded) && isset($decoded['error'])) {
            sendError('XLS conversion failed: ' . $decoded['error'], 400);
        }
    }

    return $output;
}

function readSpreadsheetEntry($filepath, $entryName) {
    if (class_exists('ZipArchive')) {
        $zip = new ZipArchive();
        if ($zip->open($filepath) === true) {
            $content = $zip->getFromName($entryName);
            $zip->close();
            if ($content !== false) {
                return $content;
            }
        }
    }

    $resolvedPath = realpath($filepath) ?: $filepath;
    $resolvedPath = str_replace('\\', '/', $resolvedPath);
    $content = @file_get_contents('phar://' . $resolvedPath . '/' . ltrim($entryName, '/'));
    return $content !== false ? $content : false;
}

function columnLetterToIndex($letters) {
    $index = 0;
    $letters = strtoupper($letters);
    for ($i = 0; $i < strlen($letters); $i++) {
        $index = ($index * 26) + (ord($letters[$i]) - ord('A') + 1);
    }
    return $index - 1;
}

function generateXlsxTemplate($filepath) {
    $headers = ['EmployeeID', 'EmployeeName', 'Role', 'Branch', 'DaysWorked', 'OvertimeHours', 'LateMinutes', 'AbsentDays', 'LeaveDays'];
    $columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

    $sharedStringsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' . count($headers) . '" uniqueCount="' . count($headers) . '">';
    foreach ($headers as $header) {
        $sharedStringsXml .= '<si><t>' . htmlspecialchars($header, ENT_XML1) . '</t></si>';
    }
    $sharedStringsXml .= '</sst>';

    $sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        . '<cols>'
        . '<col min="1" max="1" width="14" bestFit="1" customWidth="1"/>'
        . '<col min="2" max="4" width="20" bestFit="1" customWidth="1"/>'
        . '<col min="5" max="9" width="16" bestFit="1" customWidth="1"/>'
        . '</cols>'
        . '<sheetData>'
        . '<row r="1">';
    foreach ($columns as $index => $column) {
        $sheetXml .= '<c r="' . $column . '1" t="s" s="1"><v>' . $index . '</v></c>';
    }
    $sheetXml .= '</row></sheetData></worksheet>';

    $entries = [
        '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>',
        '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>',
        'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>',
        'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="Attendance" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>',
        'xl/styles.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/></patternFill></fill></fills>'
            . '<borders count="1"><border/></borders>'
            . '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
            . '<cellXfs count="2"><xf fontId="0" fillId="0" borderId="0"/><xf fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs>'
            . '</styleSheet>',
        'xl/sharedStrings.xml' => $sharedStringsXml,
        'xl/worksheets/sheet1.xml' => $sheetXml,
    ];

    if (file_put_contents($filepath, buildZipArchive($entries)) === false) {
        sendError('Failed to create template file', 500);
    }
}

function buildZipArchive($entries) {
    $files = '';
    $centralDirectory = '';
    $offset = 0;
    [$dosTime, $dosDate] = getZipDosDateTime();

    foreach ($entries as $name => $content) {
        $name = str_replace('\\', '/', ltrim((string)$name, '/'));
        $content = (string)$content;
        $size = strlen($content);
        $crc = crc32($content);
        if ($crc < 0) {
            $crc += 4294967296;
        }

        $localHeader = pack(
            'VvvvvvVVVvv',
            0x04034b50,
            20,
            0,
            0,
            $dosTime,
            $dosDate,
            $crc,
            $size,
            $size,
            strlen($name),
            0
        ) . $name;

        $fileRecord = $localHeader . $content;
        $files .= $fileRecord;

        $centralDirectory .= pack(
            'VvvvvvvVVVvvvvvVV',
            0x02014b50,
            20,
            20,
            0,
            0,
            $dosTime,
            $dosDate,
            $crc,
            $size,
            $size,
            strlen($name),
            0,
            0,
            0,
            0,
            0,
            $offset
        ) . $name;

        $offset += strlen($fileRecord);
    }

    $endOfCentralDirectory = pack(
        'VvvvvVVv',
        0x06054b50,
        0,
        0,
        count($entries),
        count($entries),
        strlen($centralDirectory),
        strlen($files),
        0
    );

    return $files . $centralDirectory . $endOfCentralDirectory;
}

function getZipDosDateTime() {
    $date = getdate();
    $year = max(1980, intval($date['year']));
    $dosTime = ($date['hours'] << 11) | ($date['minutes'] << 5) | intdiv(intval($date['seconds']), 2);
    $dosDate = (($year - 1980) << 9) | ($date['mon'] << 5) | $date['mday'];
    return [$dosTime, $dosDate];
}

closeDBConnection($conn);
