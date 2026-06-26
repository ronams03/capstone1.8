<?php
require_once 'config.php';
require_once 'utils.php';

$conn = getDBConnection();

// Check if column exists
$result = $conn->query("SHOW COLUMNS FROM users LIKE 'date_of_birth'");
if ($result->num_rows == 0) {
    // Column doesn't exist, add it
    $sql = "ALTER TABLE users ADD COLUMN date_of_birth DATE AFTER last_name";
    if ($conn->query($sql) === TRUE) {
        echo "Successfully added 'date_of_birth' column to users table.\n";
    } else {
        echo "Error adding column: " . $conn->error . "\n";
    }
} else {
    echo "Column 'date_of_birth' already exists.\n";
}

closeDBConnection($conn);
?>
