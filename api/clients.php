<?php
/**
 * Clients API
 * Handles CRUD operations for clients
 */

require_once 'config.php';
require_once 'utils.php';
require_once 'mailer.php';
require_once 'renewal_utils.php';

setCORSHeaders();

$method = getRequestMethod();
$conn = getDBConnection();
runRuntimeSchemaUpgradeOnce('clients_schema_v20260410', function () use ($conn) {
    ensureClientServiceRenewalSchema($conn);
    ensureTableIndex(
        $conn,
        'client',
        'idx_client_email',
        "ALTER TABLE client ADD INDEX idx_client_email (email)"
    );
    ensureTableIndex(
        $conn,
        'client',
        'idx_client_contact_person',
        "ALTER TABLE client ADD INDEX idx_client_contact_person (contact_person)"
    );
}, 86400);

switch ($method) {
    case 'GET':
        requireFeatureAccess('clients', ['admin', 'manager'], $conn);
        handleGet($conn);
        break;
    case 'POST':
        requireFeatureAccess('clients', ['admin', 'manager'], $conn);
        handlePost($conn);
        break;
    case 'PUT':
        requireFeatureAccess('clients', ['admin', 'manager'], $conn);
        handlePut($conn);
        break;
    case 'DELETE':
        requireFeatureAccess('clients', ['admin', 'manager'], $conn);
        handleDelete($conn);
        break;
    default:
        sendError('Method not allowed', 405);
}

function getClientProjectIds($conn, $client_id) {
    $project_ids = [];

    $proj_sql = "SELECT id FROM projects WHERE client_id = ?";
    $proj_stmt = $conn->prepare($proj_sql);
    if (!$proj_stmt) {
        return $project_ids;
    }

    $proj_stmt->bind_param('i', $client_id);
    $proj_stmt->execute();
    $proj_result = $proj_stmt->get_result();
    while ($row = $proj_result->fetch_assoc()) {
        $project_ids[] = intval($row['id']);
    }
    $proj_stmt->close();

    return $project_ids;
}

function dissolveClientRelations($conn, $client_id, $project_ids = null) {
    if (!is_array($project_ids)) {
        $project_ids = getClientProjectIds($conn, $client_id);
    }

    // Dissolve all projects for this client.
    $conn->query("UPDATE projects SET status = 'archived' WHERE client_id = $client_id AND status != 'archived'");

    // Dissolve active tasks only (keep completed/cancelled unchanged).
    if (!empty($project_ids)) {
        $ids_str = implode(',', array_map('intval', $project_ids));
        $conn->query("UPDATE tasks SET status = 'cancelled' WHERE project_id IN ($ids_str) AND status IN ('pending', 'in_progress')");
    }

    // Deactivate service assignments.
    $conn->query("UPDATE client_services SET status = 'inactive' WHERE client_id = $client_id");
}

function restoreClientRelations($conn, $client_id, $project_ids = null) {
    if (!is_array($project_ids)) {
        $project_ids = getClientProjectIds($conn, $client_id);
    }

    // Restore previously dissolved projects.
    $conn->query("UPDATE projects SET status = 'active' WHERE client_id = $client_id AND status = 'archived'");

    // Restore dissolved tasks.
    if (!empty($project_ids)) {
        $ids_str = implode(',', array_map('intval', $project_ids));
        $conn->query("UPDATE tasks SET status = 'pending' WHERE project_id IN ($ids_str) AND status = 'cancelled'");
    }

    // Reactivate service assignments.
    $conn->query("UPDATE client_services SET status = 'active' WHERE client_id = $client_id");
}

function filterActiveServiceIds($conn, $service_ids) {
    if (!is_array($service_ids) || empty($service_ids)) {
        return [];
    }

    $ids = [];
    foreach ($service_ids as $sid) {
        $value = intval($sid);
        if ($value > 0) {
            $ids[$value] = true;
        }
    }
    $ids = array_keys($ids);

    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT service_id
            FROM services
            WHERE service_id IN ($placeholders)
              AND (
                    description IS NULL
                    OR TRIM(UPPER(description)) NOT LIKE '[ARCHIVED]%'
                  )";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }

    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $result = $stmt->get_result();

    $filtered = [];
    while ($row = $result->fetch_assoc()) {
        $filtered[] = intval($row['service_id']);
    }
    $stmt->close();

    return array_values(array_unique($filtered));
}

function buildContactPersonName($data) {
    $first_name = normalizeClientText($data['contact_first_name'] ?? '');
    $last_name = normalizeClientText($data['contact_last_name'] ?? '');
    $combined = trim($first_name . ' ' . $last_name);

    if ($combined !== '') {
        return $combined;
    }

    return normalizeClientText($data['contact_person'] ?? '');
}

function normalizeClientText($value) {
    $sanitized = sanitizeInput((string)$value);
    return trim(html_entity_decode((string)$sanitized, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
}

function normalizeClientEmail($value) {
    return strtolower(normalizeClientText($value));
}

function decodeClientRowText($row) {
    if (!is_array($row)) return $row;

    foreach (['client_name', 'contact_person', 'email', 'phone', 'address'] as $field) {
        if (isset($row[$field]) && is_string($row[$field])) {
            $row[$field] = html_entity_decode($row[$field], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }
    }

    return $row;
}

function assertUniqueClientName($conn, $clientName, $excludeClientId = null) {
    $name = trim((string)$clientName);
    if ($name === '') return;

    if ($excludeClientId !== null && intval($excludeClientId) > 0) {
        $id = intval($excludeClientId);
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(client_name)) = LOWER(TRIM(?))
               AND client_id <> ?
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client name.', 500);
        $stmt->bind_param('si', $name, $id);
    } else {
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(client_name)) = LOWER(TRIM(?))
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client name.', 500);
        $stmt->bind_param('s', $name);
    }

    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($exists) {
        sendError('Client name already exists.', 409);
    }
}

function assertUniqueClientEmail($conn, $email, $excludeClientId = null) {
    $value = trim((string)$email);
    if ($value === '') return;

    if ($excludeClientId !== null && intval($excludeClientId) > 0) {
        $id = intval($excludeClientId);
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
               AND client_id <> ?
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client email.', 500);
        $stmt->bind_param('si', $value, $id);
    } else {
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client email.', 500);
        $stmt->bind_param('s', $value);
    }

    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($exists) {
        sendError('Client email already exists.', 409);
    }
}

function assertUniqueClientContactPerson($conn, $contactPerson, $excludeClientId = null) {
    $value = trim((string)$contactPerson);
    if ($value === '') return;

    if ($excludeClientId !== null && intval($excludeClientId) > 0) {
        $id = intval($excludeClientId);
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(contact_person)) = LOWER(TRIM(?))
               AND client_id <> ?
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client contact person.', 500);
        $stmt->bind_param('si', $value, $id);
    } else {
        $stmt = $conn->prepare(
            "SELECT client_id
             FROM client
             WHERE LOWER(TRIM(contact_person)) = LOWER(TRIM(?))
             LIMIT 1"
        );
        if (!$stmt) sendError('Failed to validate duplicate client contact person.', 500);
        $stmt->bind_param('s', $value);
    }

    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();

    if ($exists) {
        sendError('Contact person already exists.', 409);
    }
}

/**
 * GET - Retrieve clients
 */
function handleGet($conn) {
    $client_id = $_GET['id'] ?? null;
    
    if ($client_id) {
        // Get single client with related data
        $sql = "SELECT c.*,
                       (SELECT COUNT(*) FROM projects WHERE client_id = c.client_id) as project_count,
                       0 as invoice_count,
                       0.00 as total_paid,
                       0.00 as total_outstanding
                FROM client c
                WHERE c.client_id = ?";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('i', $client_id);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($row = $result->fetch_assoc()) {
            $row = decodeClientRowText($row);
            sendResponse(true, $row, 'Client retrieved successfully');
        } else {
            sendError('Client not found', 404);
        }
    } else {
        // Get all clients
        $status = $_GET['status'] ?? null;
        $search = $_GET['search'] ?? null;
        
        $sql = "SELECT c.*,
                       COALESCE(project_counts.project_count, 0) AS project_count
                FROM client c
                LEFT JOIN (
                    SELECT client_id, COUNT(*) AS project_count
                    FROM projects
                    GROUP BY client_id
                ) project_counts ON project_counts.client_id = c.client_id
                WHERE 1=1";
        
        $params = [];
        $types = '';
        
        if ($status) {
            $sql .= " AND c.status = ?";
            $params[] = $status;
            $types .= 's';
        }
        
        if ($search) {
            $sql .= " AND (c.client_name LIKE ? OR c.contact_person LIKE ? OR c.email LIKE ?)";
            $search_param = "%$search%";
            $params[] = $search_param;
            $params[] = $search_param;
            $params[] = $search_param;
            $types .= 'sss';
        }
        
        $sql .= " ORDER BY LOWER(TRIM(COALESCE(c.client_name, ''))) ASC, c.client_id ASC";
        
        if (!empty($params)) {
            $stmt = $conn->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $result = $stmt->get_result();
        } else {
            $result = $conn->query($sql);
        }
        
        $clients = [];
        $clientIds = [];
        while ($row = $result->fetch_assoc()) {
            $row = decodeClientRowText($row);
            $row['services'] = [];
            $clients[] = $row;
            $clientIds[] = intval($row['client_id']);
        }

        $servicesByClientId = [];
        $clientIds = array_values(array_unique(array_filter($clientIds, function ($id) {
            return intval($id) > 0;
        })));

        if (!empty($clientIds)) {
            $placeholders = implode(',', array_fill(0, count($clientIds), '?'));
            $types = str_repeat('i', count($clientIds));
            $serviceSql = "SELECT
                               cs.client_id,
                               cs.id AS client_service_id,
                               s.service_id,
                               s.service_name,
                               cs.assigned_date,
                               cs.status AS service_assignment_status,
                               cs.renewal_required,
                               cs.expiry_date,
                               cs.last_renewed_at,
                               cs.reminder_days_before,
                               cs.renewal_cycle,
                               cs.auto_renew_enabled,
                               cs.renewal_notes,
                               cs.change_notes
                           FROM client_services cs
                           INNER JOIN services s ON s.service_id = cs.service_id
                           WHERE cs.client_id IN ($placeholders)
                             AND cs.status = 'active'
                             AND (
                                   s.description IS NULL
                                   OR TRIM(UPPER(s.description)) NOT LIKE '[ARCHIVED]%'
                                 )
                           ORDER BY cs.client_id ASC,
                                    LOWER(TRIM(COALESCE(s.service_name, ''))) ASC,
                                    s.service_id ASC";
            $serviceStmt = $conn->prepare($serviceSql);
            if ($serviceStmt) {
                $serviceStmt->bind_param($types, ...$clientIds);
                $serviceStmt->execute();
                $serviceResult = $serviceStmt->get_result();

                while ($serviceRow = $serviceResult->fetch_assoc()) {
                    $clientId = intval($serviceRow['client_id'] ?? 0);
                    if ($clientId <= 0) continue;
                    if (!isset($servicesByClientId[$clientId])) {
                        $servicesByClientId[$clientId] = [];
                    }
                    $servicesByClientId[$clientId][] = buildClientServiceRenewalSnapshot($serviceRow);
                }

                $serviceStmt->close();
            }
        }

        foreach ($clients as &$clientRow) {
            $clientId = intval($clientRow['client_id'] ?? 0);
            $clientRow['services'] = $servicesByClientId[$clientId] ?? [];
        }
        unset($clientRow);
        
        sendResponse(true, $clients, 'Clients retrieved successfully');
    }
}

/**
 * POST - Create new client
 */
function handlePost($conn) {
    $data = getJSONInput();
    
    // Validate required fields
    $required = ['client_name'];
    $missing = validateRequiredFields($data, $required);
    
    if ($missing) {
        sendError('Missing required fields: ' . implode(', ', $missing), 400);
    }
    
    // Validate email if provided
    if (isset($data['email']) && !empty($data['email']) && !validateEmail($data['email'])) {
        sendError('Invalid email format', 400);
    }
    
    $client_name = normalizeClientText($data['client_name']);
    $contact_person = buildContactPersonName($data);
    $email = normalizeClientEmail($data['email'] ?? '');
    $phone = normalizeInternationalPhoneNumber($data['phone'] ?? '', '+63');
    if ($phone === false) {
        sendError('Phone number must be a valid international number with a country code, like +639123456789.', 400);
    }
    $phone = $phone ?? '';
    $address = normalizeClientText($data['address'] ?? '');
    $status = $data['status'] ?? 'active';
    // Always use current server date on client creation.
    $registration_date = date('Y-m-d');

    assertUniqueClientName($conn, $client_name);
    assertUniqueClientEmail($conn, $email);
    assertUniqueClientContactPerson($conn, $contact_person);

    $service_ids = (isset($data['service_ids']) && is_array($data['service_ids'])) ? $data['service_ids'] : [];
    $service_ids = filterActiveServiceIds($conn, $service_ids);
    if (empty($service_ids)) {
        sendError('Please select at least one service.', 400);
    }
    
    $sql = "INSERT INTO client (client_name, contact_person, email, phone, address, status, registration_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('sssssss', $client_name, $contact_person, $email, $phone, $address, $status, $registration_date);
    
    if ($stmt->execute()) {
        $client_id = $conn->insert_id;
        
        // Handle Services
        if (!empty($service_ids)) {
            $serviceAssignments = mapRenewalAssignmentsByServiceId($data['service_assignments'] ?? []);
            manageClientServices($conn, $client_id, $service_ids, $serviceAssignments);
        }

        $welcome_email = sendClientOnboardingEmail($conn, $client_name, $contact_person, $email, $service_ids);
        
        // Log activity
        if ($user_id = checkAuthentication()) {
            logActivity($conn, $user_id, 'create_client', "Created client: $client_name", 'client_management');
        }

        $response_data = [
            'client_id' => $client_id,
            'welcome_email_attempted' => $welcome_email['attempted'],
            'welcome_email_sent' => $welcome_email['sent'],
            'welcome_email_note' => $welcome_email['message'],
        ];
        $response_message = ($welcome_email['attempted'] && !$welcome_email['sent'])
            ? 'Client created successfully, but welcome email could not be sent.'
            : 'Client created successfully';

        sendResponse(true, $response_data, $response_message, 201);
    } else {
        sendError('Failed to create client: ' . $conn->error, 500);
    }
}

/**
 * PUT - Update client
 */
function handlePut($conn) {
    $data = getJSONInput();
    
    if (!isset($data['client_id'])) {
        sendError('Client ID is required', 400);
    }
    
    $client_id = intval($data['client_id']);
    
    // Check if client exists
    $check_sql = "SELECT client_id, status, client_name, email, contact_person FROM client WHERE client_id = ?";
    $check_stmt = $conn->prepare($check_sql);
    $check_stmt->bind_param('i', $client_id);
    $check_stmt->execute();

    $existing_client = $check_stmt->get_result()->fetch_assoc();
    if (!$existing_client) {
        sendError('Client not found', 404);
    }

    $current_status = strtolower((string)($existing_client['status'] ?? ''));
    $contact_name_update_requested = isset($data['contact_first_name']) || isset($data['contact_last_name']) || isset($data['contact_person']);

    if (isset($data['client_name'])) {
        assertUniqueClientName($conn, normalizeClientText($data['client_name']), $client_id);
    }
    if (isset($data['email'])) {
        assertUniqueClientEmail($conn, normalizeClientEmail($data['email']), $client_id);
    }
    if ($contact_name_update_requested) {
        assertUniqueClientContactPerson($conn, buildContactPersonName($data), $client_id);
    }
    
    $updates = [];
    $params = [];
    $types = '';
    
    $allowed_fields = ['client_name', 'email', 'phone', 'address', 'status'];
    
    foreach ($allowed_fields as $field) {
        if (isset($data[$field])) {
            $updates[] = "$field = ?";
            if ($field === 'status') {
                $params[] = sanitizeInput($data[$field]);
            } elseif ($field === 'phone') {
                $normalizedPhone = normalizeInternationalPhoneNumber($data[$field], '+63');
                if ($normalizedPhone === false) {
                    sendError('Phone number must be a valid international number with a country code, like +639123456789.', 400);
                }
                $params[] = $normalizedPhone ?? '';
            } elseif ($field === 'email') {
                $params[] = normalizeClientEmail($data[$field]);
            } else {
                $params[] = normalizeClientText($data[$field]);
            }
            $types .= 's';
        }
    }

    if (isset($data['contact_first_name']) || isset($data['contact_last_name']) || isset($data['contact_person'])) {
        $updates[] = "contact_person = ?";
        $params[] = buildContactPersonName($data);
        $types .= 's';
    }
    
    if (!empty($updates)) {
        $params[] = $client_id;
        $types .= 'i';
        
        $sql = "UPDATE client SET " . implode(', ', $updates) . " WHERE client_id = ?";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
    }

    // Cascade dissolve/restore when client status changes.
    if (isset($data['status'])) {
        $next_status = strtolower(trim((string)$data['status']));
        if ($next_status === 'inactive' && $current_status !== 'inactive') {
            dissolveClientRelations($conn, $client_id);
        } elseif ($next_status === 'active' && $current_status === 'inactive') {
            restoreClientRelations($conn, $client_id);
        }
    }

    // Handle Services Update
    if (isset($data['service_ids']) && is_array($data['service_ids'])) {
        $service_ids = filterActiveServiceIds($conn, $data['service_ids']);
        if (empty($service_ids)) {
            sendError('Please select at least one service.', 400);
        }
        $serviceAssignments = mapRenewalAssignmentsByServiceId($data['service_assignments'] ?? []);
        manageClientServices($conn, $client_id, $service_ids, $serviceAssignments);
    }

    // Log update
    if ($user_id = checkAuthentication()) {
        logActivity($conn, $user_id, 'update_client', "Updated client ID: $client_id", 'client_management');
    }
    
    sendResponse(true, null, 'Client updated successfully');
}

/**
 * DELETE - Delete client (soft delete with cascade, or permanent)
 */
function handleDelete($conn) {
    $client_id = $_GET['id'] ?? null;
    $permanent = isset($_GET['permanent']) && $_GET['permanent'] == '1';
    
    if (!$client_id) {
        sendError('Client ID is required', 400);
    }
    
    $client_id = intval($client_id);

    // Get all project IDs for this client (needed for cascading)
    $project_ids = getClientProjectIds($conn, $client_id);

    if ($permanent) {
        // === PERMANENT DELETE: Hard delete client and all related data ===

        if (!empty($project_ids)) {
            $ids_str = implode(',', array_map('intval', $project_ids));

            // Delete tasks belonging to client's projects
            $conn->query("DELETE FROM tasks WHERE project_id IN ($ids_str)");

            // Delete project messages belonging to client's projects
            $conn->query("DELETE FROM project_messages WHERE project_id IN ($ids_str)");

            // Delete checklist items for tasks in these projects
            // (tasks already deleted above, but checklist_items has ON DELETE CASCADE so this is already handled)
        }

        // Delete projects belonging to this client
        $conn->query("DELETE FROM projects WHERE client_id = $client_id");

        // Delete client services
        $conn->query("DELETE FROM client_services WHERE client_id = $client_id");

        // Delete document_received for this client
        $conn->query("UPDATE document_received SET client_id = NULL WHERE client_id = $client_id");

        // Hard delete the client (client_receivables_fines CASCADE automatically)
        $del_sql = "DELETE FROM client WHERE client_id = ?";
        $del_stmt = $conn->prepare($del_sql);
        $del_stmt->bind_param('i', $client_id);

        if ($del_stmt->execute()) {
            if ($user_id = checkAuthentication()) {
                logActivity($conn, $user_id, 'permanent_delete_client', "Permanently deleted client ID: $client_id and all related data", 'client_management');
            }
            sendResponse(true, null, 'Client and all related data permanently deleted');
        } else {
            sendError('Failed to delete client: ' . $conn->error, 500);
        }
    } else {
        // === SOFT DELETE (ARCHIVE): Cascade archive to related entities ===

        // 1. Archive the client
        $sql = "UPDATE client SET status = 'inactive' WHERE client_id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('i', $client_id);

        if ($stmt->execute()) {
            // 2-4. Cascade dissolve to projects, tasks, and client services.
            dissolveClientRelations($conn, $client_id, $project_ids);

            if ($user_id = checkAuthentication()) {
                logActivity($conn, $user_id, 'archive_client', "Archived client ID: $client_id and dissolved related projects/tasks", 'client_management');
            }

            sendResponse(true, null, 'Client archived and all related projects/tasks dissolved');
        } else {
            sendError('Failed to archive client: ' . $conn->error, 500);
        }
    }
}

function getServiceNamesByIds($conn, $service_ids) {
    if (!is_array($service_ids) || empty($service_ids)) {
        return [];
    }

    $ids = [];
    foreach ($service_ids as $sid) {
        $value = intval($sid);
        if ($value > 0) {
            $ids[] = $value;
        }
    }
    $ids = array_values(array_unique($ids));
    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT service_name FROM services WHERE service_id IN ($placeholders) ORDER BY service_name ASC";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }

    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $result = $stmt->get_result();

    $names = [];
    while ($row = $result->fetch_assoc()) {
        if (!empty($row['service_name'])) {
            $names[] = $row['service_name'];
        }
    }
    $stmt->close();

    return $names;
}

function sendClientOnboardingEmail($conn, $client_name, $contact_person, $email, $service_ids = []) {
    $to_email = trim((string)$email);
    if ($to_email === '') {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'No client email was provided.',
        ];
    }

    if (!validateGmailComEmail($to_email)) {
        return [
            'attempted' => false,
            'sent' => false,
            'message' => 'Welcome email skipped because the client email is not an allowed domain (@gmail.com or @phinmaed.com).',
        ];
    }

    if (!function_exists('sendMail')) {
        error_log('sendClientOnboardingEmail: sendMail function is unavailable.');
        return [
            'attempted' => true,
            'sent' => false,
            'message' => 'Welcome email service is unavailable.',
        ];
    }

    $recipient_name = trim((string)$contact_person) !== '' ? trim((string)$contact_person) : trim((string)$client_name);
    $safe_client_name = htmlspecialchars((string)$client_name, ENT_QUOTES, 'UTF-8');
    $safe_recipient_name = htmlspecialchars((string)($recipient_name ?: $client_name), ENT_QUOTES, 'UTF-8');

    $service_names = getServiceNamesByIds($conn, $service_ids);
    $service_list_html = '<li>Project setup based on your selected requirements</li>';
    $service_list_alt = '- Project setup based on your selected requirements';
    if (!empty($service_names)) {
        $safe_items = array_map(function ($name) {
            return htmlspecialchars((string)$name, ENT_QUOTES, 'UTF-8');
        }, $service_names);
        $service_list_html = '';
        foreach ($safe_items as $service_name) {
            $service_list_html .= '<li>' . $service_name . '</li>';
        }
        $service_list_alt = "- " . implode("\n- ", $service_names);
    }

    $branding = function_exists('getEmailBranding')
        ? getEmailBranding()
        : ['brand_name' => 'LLB Accountants'];
    $brand_name = (string)($branding['brand_name'] ?? 'LLB Accountants');
    $safe_brand_name = htmlspecialchars($brand_name, ENT_QUOTES, 'UTF-8');

    $subject = 'Welcome to ' . $brand_name . ' - Project Initiation Confirmation';
    $content = '<p style="margin:0 0 14px 0;font-size:15px;line-height:1.7;">Dear ' . $safe_recipient_name . ',</p>'
        . '<p style="margin:0 0 14px 0;font-size:14px;line-height:1.8;color:#1f2937;">'
        . 'Thank you for selecting <strong>' . $safe_brand_name . '</strong>. '
        . 'We are pleased to confirm that we have formally initiated the service engagement for '
        . '<strong>' . $safe_client_name . '</strong>.'
        . '</p>'
        . '<div style="margin:0 0 14px 0;padding:12px 14px;background:#f8fafc;border:1px solid #dbe3ef;border-radius:10px;">'
        . '<p style="margin:0 0 8px 0;font-size:13px;font-weight:700;color:#1f2937;">Selected Service Scope</p>'
        . '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:#334155;">' . $service_list_html . '</ul>'
        . '</div>'
        . '<p style="margin:0 0 14px 0;font-size:14px;line-height:1.8;color:#1f2937;">'
        . 'Our team is now preparing the required workflow and will provide updates as milestones are completed.'
        . '</p>'
        . '<p style="margin:0;font-size:14px;line-height:1.8;color:#1f2937;">'
        . 'We appreciate your trust and look forward to delivering excellent service.'
        . '</p>'
        . '<p style="margin:16px 0 0 0;font-size:14px;line-height:1.8;color:#1f2937;">'
        . 'Sincerely,<br><strong>' . $safe_brand_name . ' Team</strong>'
        . '</p>';

    $html = function_exists('buildBrandedEmailLayout')
        ? buildBrandedEmailLayout($content, 'Your service engagement has been initiated successfully.')
        : '<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2937;line-height:1.6;">' . $content . '</div>';

    $alt = "Dear " . ($recipient_name ?: $client_name) . ",\n\n"
        . "Thank you for selecting " . $brand_name . ".\n"
        . "We are pleased to confirm that we have formally initiated the service engagement for " . $client_name . ".\n\n"
        . "Selected Service Scope:\n"
        . $service_list_alt . "\n\n"
        . "Our team is now preparing the required workflow and will provide updates as milestones are completed.\n\n"
        . "We appreciate your trust and look forward to delivering excellent service.\n\n"
        . "Sincerely,\n"
        . $brand_name . " Team";

    $sent = sendMail($to_email, $recipient_name, $subject, $html, $alt);
    if (!$sent) {
        error_log('sendClientOnboardingEmail: failed for client ' . $client_name . ' <' . $to_email . '>');
    }

    return [
        'attempted' => true,
        'sent' => (bool)$sent,
        'message' => $sent ? 'Welcome email sent.' : 'Failed to send welcome email.',
    ];
}

/**
 * Helper to manage client services
 */
function manageClientServices($conn, $client_id, $service_ids, $serviceAssignments = []) {
    $service_ids = filterActiveServiceIds($conn, $service_ids);

    $serviceAssignments = is_array($serviceAssignments) ? $serviceAssignments : [];
    $existingAssignments = [];
    $existingSql = "SELECT
                        id AS client_service_id,
                        service_id,
                        renewal_required,
                        expiry_date,
                        last_renewed_at,
                        reminder_days_before,
                        renewal_cycle,
                        auto_renew_enabled,
                        renewal_notes,
                        change_notes
                    FROM client_services
                    WHERE client_id = ?";
    $existingStmt = $conn->prepare($existingSql);
    if ($existingStmt) {
        $existingStmt->bind_param('i', $client_id);
        $existingStmt->execute();
        $existingResult = $existingStmt->get_result();
        while ($row = $existingResult->fetch_assoc()) {
            $existingAssignments[intval($row['service_id'])] = $row;
        }
        $existingStmt->close();
    }

    $keepIds = [];
    $updateSql = "UPDATE client_services
                  SET status = 'active',
                      renewal_required = ?,
                      expiry_date = ?,
                      last_renewed_at = ?,
                      reminder_days_before = ?,
                      renewal_cycle = ?,
                      auto_renew_enabled = ?,
                      renewal_notes = ?,
                      change_notes = ?
                  WHERE id = ?
                  LIMIT 1";
    $updateStmt = $conn->prepare($updateSql);

    $insertSql = "INSERT INTO client_services (
                        client_id,
                        service_id,
                        renewal_required,
                        expiry_date,
                        last_renewed_at,
                        reminder_days_before,
                        renewal_cycle,
                        auto_renew_enabled,
                        renewal_notes,
                        change_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    $insertStmt = $conn->prepare($insertSql);

    foreach ($service_ids as $sid) {
        $sid = intval($sid);
        if ($sid <= 0) continue;

        $existing = $existingAssignments[$sid] ?? null;
        $payload = normalizeRenewalSettingsArray($serviceAssignments[$sid] ?? [], $existing);

        if ($existing && $updateStmt) {
            $clientServiceId = intval($existing['client_service_id'] ?? 0);
            $updateStmt->bind_param(
                'issisissi',
                $payload['renewal_required'],
                $payload['expiry_date'],
                $payload['last_renewed_at'],
                $payload['reminder_days_before'],
                $payload['renewal_cycle'],
                $payload['auto_renew_enabled'],
                $payload['renewal_notes'],
                $payload['change_notes'],
                $clientServiceId
            );
            $updateStmt->execute();
            $keepIds[] = $clientServiceId;
            continue;
        }

        if ($insertStmt) {
            $insertStmt->bind_param(
                'iiissisiss',
                $client_id,
                $sid,
                $payload['renewal_required'],
                $payload['expiry_date'],
                $payload['last_renewed_at'],
                $payload['reminder_days_before'],
                $payload['renewal_cycle'],
                $payload['auto_renew_enabled'],
                $payload['renewal_notes'],
                $payload['change_notes']
            );
            $insertStmt->execute();
            $keepIds[] = intval($conn->insert_id);
        }
    }

    if ($updateStmt) {
        $updateStmt->close();
    }
    if ($insertStmt) {
        $insertStmt->close();
    }

    $existingIds = [];
    foreach ($existingAssignments as $assignment) {
        $existingIds[] = intval($assignment['client_service_id'] ?? 0);
    }

    $idsToDelete = array_values(array_diff($existingIds, $keepIds));
    if (!empty($idsToDelete)) {
        $placeholders = implode(',', array_fill(0, count($idsToDelete), '?'));
        $types = str_repeat('i', count($idsToDelete));
        $deleteSql = "DELETE FROM client_services WHERE id IN ($placeholders)";
        $deleteStmt = $conn->prepare($deleteSql);
        if ($deleteStmt) {
            $deleteStmt->bind_param($types, ...$idsToDelete);
            $deleteStmt->execute();
            $deleteStmt->close();
        }
    }
}

closeDBConnection($conn);
?>
