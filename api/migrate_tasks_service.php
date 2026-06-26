<?php
require_once 'config.php';

$conn = getDBConnection();

// Check if column exists
$check = $conn->query("SHOW COLUMNS FROM tasks LIKE 'service_id'");
if ($check->num_rows == 0) {
    $sql = "ALTER TABLE tasks ADD COLUMN service_id INT NULL AFTER project_id";
    if ($conn->query($sql)) {
        echo "Successfully added service_id column to tasks table.";
        // Add foreign key constraint
        $conn->query("ALTER TABLE tasks ADD CONSTRAINT fk_task_service FOREIGN KEY (service_id) REFERENCES services(service_id) ON DELETE SET NULL");
    } else {
        echo "Error adding column: " . $conn->error;
    }
} else {
    echo "Column service_id already exists.";
}

$conn->close();
?>
