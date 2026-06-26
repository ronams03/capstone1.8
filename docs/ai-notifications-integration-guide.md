# AI Smart Notifications - Integration Guide

## ✅ **What's Been Built:**

1. ✅ **Base44 Configuration** - Updated with your credentials
2. ✅ **AI Notification Generator** - `api/ai_notifications.php`
3. ✅ **Database Table** - `ai_notifications` for storing AI notifications
4. ✅ **Notifications API Integration** - Fetches and displays AI notifications
5. ✅ **Helper Functions** - Easy to call from anywhere in the system

---

## 🚀 **How to Use AI Notifications:**

### **Example 1: When a Task is Completed**

Add this to your task completion endpoint (e.g., `api/tasks.php`):

```php
require_once 'ai_notifications.php';

// When task is marked as completed
if ($taskStatus === 'completed') {
    // Get task details
    $task = getTaskDetails($conn, $taskId);
    $completedBy = getUserDetails($conn, $currentUserId);
    
    // Prepare context for AI
    $context = [
        'event_type' => 'task_completed',
        'task_title' => $task['title'],
        'project_name' => $task['project_name'],
        'client_name' => $task['client_name'],
        'completed_by_name' => $completedBy['first_name'] . ' ' . $completedBy['last_name'],
        'completion_date' => date('Y-m-d'),
        'was_early' => strtotime($task['completed_at']) < strtotime($task['due_date']),
        'days_variance' => floor((strtotime($task['due_date']) - strtotime($task['completed_at'])) / 86400),
        'remaining_tasks' => $task['remaining_tasks'],
        'project_deadline' => $task['project_deadline'],
        'days_until_deadline' => floor((strtotime($task['project_deadline']) - time()) / 86400)
    ];
    
    // Notify project manager
    createAINotification(
        $conn,
        'task_completed',
        $task['assigned_by'],  // Manager who assigned
        'manager',
        $context,
        '/projects/detail?id=' . $task['project_id']
    );
}
```

---

### **Example 2: When Leave Request is Submitted**

Add this to your leave request endpoint:

```php
require_once 'ai_notifications.php';

// When leave request is created
if ($leaveRequestCreated) {
    $context = [
        'event_type' => 'leave_requested',
        'employee_name' => $employee['first_name'] . ' ' . $employee['last_name'],
        'leave_type' => $leaveData['leave_type'],
        'duration_days' => $leaveData['duration_days'],
        'start_date' => $leaveData['start_date'],
        'end_date' => $leaveData['end_date'],
        'available_coverage' => $teamCoverage,
        'conflicting_deadlines' => $conflicts,
        'pending_tasks_count' => $pendingTasks
    ];
    
    // Notify all admins
    $admins = getAllUsersByRole($conn, 'admin');
    foreach ($admins as $admin) {
        createAINotification(
            $conn,
            'leave_requested',
            $admin['id'],
            'admin',
            $context,
            '/leave-requests'
        );
    }
    
    // Notify the employee's manager
    if ($employee['manager_id']) {
        createAINotification(
            $conn,
            'leave_requested',
            $employee['manager_id'],
            'manager',
            $context,
            '/leave-requests'
        );
    }
}
```

---

### **Example 3: When Payslip is Released**

Add this to your payroll release endpoint:

```php
require_once 'ai_notifications.php';

// When payslip is released to employee
if ($payslipReleased) {
    $context = [
        'event_type' => 'payroll_ready',
        'employee_name' => $employee['first_name'],
        'pay_period_start' => $payroll['period_start'],
        'pay_period_end' => $payroll['period_end'],
        'gross_pay' => $payroll['gross_pay'],
        'total_deductions' => $payroll['total_deductions'],
        'net_pay' => $payroll['net_pay'],
        'overtime_hours' => $payroll['overtime_hours'],
        'days_worked' => $payroll['days_worked']
    ];
    
    // Notify the employee
    createAINotification(
        $conn,
        'payroll_ready',
        $employee['user_id'],
        'staff',
        $context,
        '/my-payslips'
    );
}
```

---

### **Example 4: When Task is Assigned**

Add this to your task assignment endpoint:

```php
require_once 'ai_notifications.php';

// When task is assigned to someone
if ($taskAssigned) {
    $context = [
        'event_type' => 'task_assigned',
        'task_title' => $taskData['title'],
        'task_priority' => $taskData['priority'],
        'project_name' => $project['name'],
        'due_date' => $taskData['due_date'],
        'days_until_due' => floor((strtotime($taskData['due_date']) - time()) / 86400),
        'assigner_name' => $assigner['first_name'] . ' ' . $assigner['last_name']
    ];
    
    // Notify the assignee
    createAINotification(
        $conn,
        'task_assigned',
        $assignedToUserId,
        'staff',
        $context,
        '/my-tasks'
    );
}
```

---

### **Example 5: Batch Notifications for Project Milestone**

```php
require_once 'ai_notifications.php';

// When project reaches milestone
if ($milestoneReached) {
    $context = [
        'event_type' => 'project_milestone',
        'project_name' => $project['name'],
        'milestone_name' => $milestone['name'],
        'completion_percentage' => $project['completion_percentage'],
        'completed_tasks' => $project['completed_tasks'],
        'total_tasks' => $project['total_tasks'],
        'team_size' => $teamSize
    ];
    
    // Get all project team members
    $teamMembers = getProjectTeamMembers($conn, $projectId);
    
    // Create batch notifications
    $targets = [];
    foreach ($teamMembers as $member) {
        $targets[] = [
            'user_id' => $member['user_id'],
            'role' => $member['role']
        ];
    }
    
    $count = createBatchAINotifications(
        $conn,
        'project_milestone',
        $targets,
        $context,
        '/projects/detail?id=' . $projectId
    );
    
    echo "Created {$count} AI notifications for team members";
}
```

---

## 📊 **AI Notification Priority System:**

The system automatically assigns priority scores:

| **Score** | **Level** | **Examples** |
|-----------|-----------|--------------|
| 9-10 | Critical | System outages, payroll errors |
| 7-8 | High | Overdue tasks, approval deadlines |
| 5-6 | Medium | Task completions, payslip ready |
| 3-4 | Low | Milestones, informational updates |
| 1-2 | Very Low | Tips, weekly summaries |

---

## 🎨 **Frontend Display:**

The AI notifications will appear in your notification panel with:

- ✨ **Emoji icons** - Visual context at a glance
- 🎯 **Smart messages** - Contextual, role-aware content
- 📊 **Priority badges** - Color-coded by urgency
- 🔗 **Action links** - Direct navigation to relevant pages
- 🤖 **AI badge** - Shows it's AI-generated

---

## 🔧 **Testing the System:**

### **Test 1: Manual Test**

Create a test notification directly:

```php
require_once 'api/ai_notifications.php';

$conn = getDBConnection();

$context = [
    'event_type' => 'task_completed',
    'task_title' => 'Test Task',
    'project_name' => 'Test Project',
    'completed_by_name' => 'John Doe',
    'was_early' => true,
    'days_variance' => 2,
    'remaining_tasks' => 5,
    'days_until_deadline' => 10
];

createAINotification(
    $conn,
    'task_completed',
    1,  // User ID
    'manager',
    $context,
    '/projects/detail?id=1'
);

echo "Test AI notification created!";
```

### **Test 2: View in Browser**

1. Login as the user
2. Go to `/notifications`
3. You should see the AI notification with emoji and smart message

---

## 📝 **Next Steps:**

1. **Run the migration:**
   ```sql
   source database/migrate_ai_notifications.sql
   ```

2. **Add integrations** to your existing workflows:
   - Task completion → Notify manager
   - Leave requests → Notify admin/manager
   - Payroll release → Notify employee
   - Task assignment → Notify assignee
   - Project milestones → Notify team

3. **Customize templates** in Base44.app to improve AI messages

4. **Monitor analytics** in `ai_notifications` table to see engagement

---

## 🎯 **Benefits:**

✅ **Smart** - Contextual, personalized messages  
✅ **Role-aware** - Different messages for different roles  
✅ **Prioritized** - Urgent items highlighted  
✅ **Actionable** - Clear next steps  
✅ **Engaging** - Emojis and natural language  
✅ **Trackable** - Analytics on engagement  

---

**Status**: ✅ **Ready to Use!**

Just add the `createAINotification()` calls to your existing workflows and the AI will handle the rest! 🚀
