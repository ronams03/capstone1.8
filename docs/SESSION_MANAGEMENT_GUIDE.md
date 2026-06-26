# Session Management Guide

## 🔍 Understanding the Session Issue

### The Problem
When you login on one tab at `localhost:3000` and open a new tab, you're asked to login again.

### Why This Happens

**Architecture:**
```
┌─────────────────────────────────────────────────────┐
│  Browser Tabs                                        │
│                                                       │
│  Tab 1: localhost:3000 (Next.js Dev Server)          │
│       ↓                                               │
│       Makes API calls to: localhost/capstone1/api     │
│       ↓                                               │
│       PHP Session Cookie set for: "localhost"         │
│                                                       │
│  Tab 2: localhost:3000 (New Tab)                     │
│       ↓                                               │
│       Different port = Different origin               │
│       ↓                                               │
│       Browser doesn't share cookies across ports      │
│       ↓                                               │
│       No session cookie = Login required              │
└─────────────────────────────────────────────────────┘
```

**Technical Details:**

1. **Session Storage**: PHP stores sessions on the server (Apache/XAMPP)
2. **Cookie Domain**: Session cookie is tied to `localhost` (Apache's domain)
3. **Port Difference**: 
   - Apache runs on: `localhost` (port 80)
   - Next.js runs on: `localhost:3000` (port 3000)
4. **Browser Security**: Different ports = Different origins = No cookie sharing

---

## ✅ Solutions

### **Solution 1: Use PHP Server Directly (RECOMMENDED)**

**Access your app through Apache instead of Next.js dev server:**

```
❌ http://localhost:3000          (Next.js - causes session issues)
✅ http://localhost/capstone1      (PHP - sessions work perfectly)
```

**Steps:**
1. Start XAMPP (Apache + MySQL)
2. Open browser and go to: `http://localhost/capstone1`
3. Login once
4. Open multiple tabs - all will share the same session! ✅

**Why this works:**
- All tabs access the same origin (`localhost`)
- Session cookies are shared across all tabs
- No cross-origin issues

---

### **Solution 2: Fix Applied (Cookie Domain Configuration)**

We've updated your PHP session configuration to explicitly set the cookie domain:

**File:** `api/config.php`

```php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => 'localhost',  // ✅ Explicitly set for cookie sharing
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax'       // ✅ Allows top-level navigation
]);
```

**What this does:**
- Explicitly sets cookie domain to `localhost`
- Allows cookies to be shared across ports on the same domain
- Maintains security with `httponly` and `samesite` flags

**Test it:**
1. Restart XAMPP Apache
2. Clear browser cookies for localhost
3. Login at `localhost:3000`
4. Open new tab → Should stay logged in!

---

## 🔧 Development Workflow Recommendations

### **Option A: PHP-First Development (Best for Session Testing)**
```bash
# Terminal 1: Start XAMPP
# (Use XAMPP Control Panel)

# Browser: Access http://localhost/capstone1
# ✅ Sessions work across all tabs
# ✅ Real production-like environment
```

### **Option B: Next.js Dev with Workaround**
```bash
# Terminal 1: Start XAMPP (for API)
# Terminal 2: npm run dev (for Next.js)

# Browser Tab 1: http://localhost:3000
# Browser Tab 2: http://localhost:3000

# ⚠️ May need to login per tab
# Workaround: Use localStorage for dev tokens (not for production!)
```

### **Option C: Hybrid Approach**
```bash
# Use Next.js for UI development
# Test sessions on PHP server periodically

# Development: http://localhost:3000 (hot reload)
# Testing: http://localhost/capstone1 (session testing)
```

---

## 🐛 Troubleshooting

### **Issue: Still asked to login on new tabs**

**Check 1: Clear old cookies**
```
1. Open DevTools (F12)
2. Go to Application tab
3. Clear all cookies for localhost
4. Close all browser tabs
5. Reopen and login again
```

**Check 2: Verify cookie is set**
```
1. Login to the app
2. Open DevTools (F12)
3. Go to Application → Cookies
4. Look for PHPSESSID cookie
5. Check the "Domain" column - should be "localhost"
```

**Check 3: Check API calls**
```
1. Open DevTools Network tab
2. Make an API call
3. Check Request Headers
4. Look for: "Cookie: PHPSESSID=xxxxx"
5. If missing → credentials not being sent
```

**Check 4: Verify fetch credentials**
```typescript
// All fetch calls MUST include:
fetch(`${API_BASE_URL}/api/auth.php`, {
    credentials: 'include',  // ✅ This is required!
    // ... other options
});
```

---

### **Issue: CORS errors**

**Error Message:**
```
Access to fetch at 'http://localhost/capstone1/api/auth.php' from origin 
'http://localhost:3000' has been blocked by CORS policy
```

**Solution:** Already configured in your `api/utils.php`:
```php
function setCORSHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Credentials: true');
    }
}
```

---

## 📊 Session Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│  CORRECT SESSION FLOW (Using PHP Server)                     │
│                                                               │
│  1. User visits: http://localhost/capstone1                  │
│         ↓                                                     │
│  2. Enters credentials and clicks Login                      │
│         ↓                                                     │
│  3. PHP creates session and sets cookie:                     │
│     - Name: PHPSESSID                                        │
│     - Domain: localhost                                      │
│     - Path: /                                                │
│         ↓                                                     │
│  4. Browser stores cookie for "localhost" domain             │
│         ↓                                                     │
│  5. User opens new tab: http://localhost/capstone1           │
│         ↓                                                     │
│  6. Browser automatically sends PHPSESSID cookie             │
│         ↓                                                     │
│  7. PHP reads session → User is logged in! ✅                │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  PROBLEMATIC FLOW (Using Next.js Dev Server)                │
│                                                               │
│  1. User visits: http://localhost:3000                       │
│         ↓                                                     │
│  2. Enters credentials and clicks Login                      │
│         ↓                                                     │
│  3. Next.js calls: http://localhost/capstone1/api/auth.php   │
│         ↓                                                     │
│  4. PHP creates session and sets cookie for "localhost"      │
│         ↓                                                     │
│  5. Browser stores cookie (domain: localhost, port: 80)      │
│         ↓                                                     │
│  6. User opens new tab: http://localhost:3000                │
│         ↓                                                     │
│  7. Browser checks: No cookie for "localhost:3000" ❌        │
│         ↓                                                     │
│  8. Next.js checks session → No cookie → Login required ❌   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🎯 Best Practices

### **For Development:**
1. ✅ Use `http://localhost/capstone1` for session testing
2. ✅ Use `http://localhost:3000` for UI/component development
3. ✅ Clear cookies when switching between environments
4. ✅ Always include `credentials: 'include'` in fetch calls

### **For Production:**
1. ✅ Serve Next.js static files through Apache
2. ✅ Use same domain for frontend and API
3. ✅ Enable HTTPS for secure cookies
4. ✅ Set proper `SameSite` cookie attribute

### **Security Considerations:**
1. 🔒 Never expose session IDs in URLs
2. 🔒 Use `httponly` flag on cookies (already set ✅)
3. 🔒 Use `secure` flag in production (HTTPS only)
4. 🔒 Implement session timeout (already implemented ✅)
5. 🔒 Regenerate session ID after login

---

## 📝 Quick Reference

| Access Method | URL | Session Sharing | Recommended For |
|--------------|-----|-----------------|-----------------|
| **PHP Server** | `http://localhost/capstone1` | ✅ Works perfectly | Production, Testing |
| **Next.js Dev** | `http://localhost:3000` | ⚠️ May not share | UI Development |

---

## 🔗 Related Files

- **Session Config:** `api/config.php` (lines 8-25)
- **CORS Headers:** `api/utils.php` (lines 11-51)
- **Auth Handler:** `api/auth.php`
- **Frontend Network:** `utils/network.ts`
- **Auth Provider:** `components/AuthProvider.tsx`

---

## 💡 Pro Tips

1. **Use different browsers for testing:**
   - Chrome: `localhost:3000` (dev)
   - Firefox: `localhost/capstone1` (session testing)

2. **Browser extensions to help:**
   - EditThisCookie (manage cookies)
   - CORS Unblock (for dev only!)

3. **Quick cookie check:**
   ```javascript
   // Paste in browser console
   document.cookie
   ```

4. **Force logout all tabs:**
   - Clear PHP session files in `C:\xampp\tmp\`
   - Or run: `session_destroy()` in PHP

---

**Last Updated:** April 12, 2026  
**Status:** ✅ Issue identified and fix applied
