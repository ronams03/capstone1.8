# Security Features Implementation Plan

## Current Security Posture

The system already includes several important baseline controls:

### [x] Already Implemented
- Authentication: PHP session-based auth with `HttpOnly`, `Secure`, `SameSite=Lax` cookies
- Password hashing: bcrypt via `PASSWORD_BCRYPT`
- Rate limiting: database-backed and configurable
- Input handling: `htmlspecialchars()` plus `sanitizeInput()`
- SQL injection prevention: prepared statements used throughout the application
- CAPTCHA: ALTCHA plus a custom triangle captcha
- Intruder lockout: browser/IP-based thresholds
- Account lockout: per-user and role-based thresholds
- System lockdown: emergency admin-only mode
- RBAC: role and feature-level access control
- Audit logging: activity log and audit trail tables

### Current Weak Spots
- CORS is too permissive and reflects untrusted origins
- CSRF protection depends too heavily on `SameSite=Lax`
- Response filtering is not yet enforced centrally
- File upload handling needs deeper server-side validation
- Secrets management and operational security can be tightened

---

## Design Principles For This Plan

This revision favors controls that are:

- High impact: closes real attack paths first
- Low friction: avoids unnecessary user pain
- Maintainable: avoids brittle custom security logic where possible
- Stack-appropriate: designed for a PHP API plus Next.js frontend

This plan intentionally avoids over-engineering. A few previously suggested items are now narrowed or deferred because they create complexity, false positives, or UX issues without delivering enough security value for this project.

---

## Recommended Implementation Roadmap

### Phase 1: Immediate Risk Reduction

Implement these first:

1. CORS allowlist and credential-safe handling
2. CSRF token protection
3. Content Security Policy in `Report-Only`, then enforced
4. File upload hardening
5. API response allowlists / serializers
6. Environment variables and secrets cleanup
7. Password improvements plus MFA for privileged users

### Phase 2: Stronger Account And Data Protection

Implement next:

8. Session visibility and revocation
9. Encryption at rest for truly sensitive fields
10. Export/download controls and auditability
11. Dependency scanning, patching, and security operations
12. Privacy, retention, and deletion workflows

### Phase 3: Conditional Or Future Work

Only implement if the product actually needs them:

13. API request signing for server-to-server or partner integrations
14. API versioning if the API becomes public or externally consumed
15. Subresource Integrity for externally hosted assets
16. Certificate pinning only if a mobile app is later introduced

---

## Core Security Features

### 1. CORS Allowlist And Credential Safety

**Priority**: High
**Effort**: Low

**Why it matters**: Reflecting arbitrary `Origin` values effectively turns CORS into "allow almost anyone." For authenticated requests, this is especially dangerous.

**Recommended approach**:
- Maintain a strict allowlist of trusted frontend origins
- Only send `Access-Control-Allow-Origin` when the origin is trusted
- Send `Access-Control-Allow-Credentials: true` only for trusted origins
- Never fall back to `*` for authenticated routes

**Safer PHP example**:

```php
function setCORSHeaders(): void {
    $allowedOrigins = [
        'https://yourdomain.com',
        'https://www.yourdomain.com',
        'http://localhost:3000',
    ];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit();
    }
}
```

**Benefits**:
- Prevents untrusted websites from making credentialed browser requests
- Reduces cross-origin attack surface
- Aligns with modern browser security expectations

---

### 2. CSRF Token Protection

**Priority**: High
**Effort**: Medium

**Why it matters**: `SameSite=Lax` helps, but it is not a full CSRF strategy for state-changing requests.

**Recommended approach**: Double-submit cookie pattern

1. Server issues a CSRF token in a cookie
2. Frontend reads the token and sends it in `X-CSRF-Token`
3. Backend validates cookie token and header token match on `POST`, `PUT`, `PATCH`, and `DELETE`

**Implementation notes**:
- Keep session cookies at `SameSite=Lax` first
- Add CSRF validation middleware to all state-changing endpoints
- Exempt only true public webhook endpoints, and verify those with signature validation instead

**Benefits**:
- Stronger protection for authenticated browser sessions
- Works well with SPA architecture
- Lower UX risk than forcing `SameSite=Strict` everywhere

---

### 3. Content Security Policy (CSP)

**Priority**: High
**Effort**: Medium

**Why it matters**: CSP helps contain XSS impact by restricting what scripts, styles, frames, and connections the browser is allowed to use.

**Recommended approach**:
- Start with `Content-Security-Policy-Report-Only`
- Use nonces or hashes for scripts where possible
- Remove `'unsafe-inline'` and `'unsafe-eval'` before final enforcement if the app can support it
- Tune `connect-src`, `img-src`, and `frame-src` to real dependencies only

**Safer baseline example**:

```javascript
const securityHeaders = [
  {
    key: 'Content-Security-Policy-Report-Only',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'nonce-__CSP_NONCE__'",
      "connect-src 'self' https://api.example.com",
      "report-uri /api/security/csp-report"
    ].join('; ')
  }
];
```

**Notes**:
- `style-src 'unsafe-inline'` may still be needed temporarily for framework compatibility
- `script-src 'unsafe-inline'` and `script-src 'unsafe-eval'` should be treated as temporary exceptions, not final state

**Benefits**:
- Reduces XSS blast radius
- Helps surface hidden inline-script dependencies
- Gives visibility through violation reports

---

### 4. File Upload Hardening

**Priority**: High
**Effort**: Medium

**Why it matters**: File uploads are a common route for malware, web shells, oversized payloads, and storage abuse.

**Required controls**:
- Validate file type server-side using MIME inspection, not just extension
- Enforce maximum size limits
- Rename files to random server-generated names
- Store uploads outside the web root when possible
- Restrict allowed types to the smallest possible set
- Strip metadata and normalize image formats where appropriate
- Add malware scanning for high-risk uploads

**Safer PHP example**:

```php
function validateUpload(array $file): ?array {
    $allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    $maxSize = 10 * 1024 * 1024;

    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        return ['error' => 'Upload failed'];
    }

    if (($file['size'] ?? 0) > $maxSize) {
        return ['error' => 'File too large'];
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $allowedMimeTypes, true)) {
        return ['error' => 'Invalid file type'];
    }

    if (str_starts_with($mimeType, 'image/')) {
        $dimensions = getimagesize($file['tmp_name']);
        if (!$dimensions || $dimensions[0] > 5000 || $dimensions[1] > 5000) {
            return ['error' => 'Invalid image dimensions'];
        }
    }

    return null;
}
```

**Benefits**:
- Prevents dangerous uploads from reaching the application
- Reduces storage abuse
- Lowers malware and web-shell risk

---

### 5. API Response Allowlists And Serializers

**Priority**: High
**Effort**: Medium

**Why it matters**: A single careless `SELECT *` or raw row return can leak password hashes, reset tokens, internal flags, or private notes.

**Recommended approach**:
- Use explicit allowlists for every response shape
- Centralize serialization logic for common entities
- Avoid relying on pattern-based removal as the primary defense

**Safer serializer example**:

```php
final class ResponseSerializer {
    private const USER_FIELDS = [
        'id',
        'username',
        'email',
        'role',
        'created_at',
        'updated_at',
    ];

    public static function user(array $row): array {
        return array_intersect_key($row, array_flip(self::USER_FIELDS));
    }
}
```

**Recommended response wrapper**:

```php
function sendJsonResponse(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit();
}
```

**Benefits**:
- Prevents accidental sensitive-data leaks
- Keeps response contracts predictable
- Makes security review easier

---

### 6. Environment Variables And Secrets Management

**Priority**: High
**Effort**: Low-Medium

**Why it matters**: Secrets stored in code or committed files are one of the fastest ways to turn a local compromise into a full system compromise.

**Recommended approach**:
- Move database credentials and encryption keys into environment variables
- Add `.env.example` but never commit real `.env` files
- Rotate secrets when exposure is suspected
- Keep separate secrets per environment

**Example**:

```php
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_USER', getenv('DB_USER') ?: '');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_NAME', getenv('DB_NAME') ?: '');
define('ENCRYPTION_KEY', getenv('ENCRYPTION_KEY') ?: '');
```

**Benefits**:
- Reduces accidental secret leakage
- Makes deployments safer and more repeatable
- Supports future secret rotation

---

### 7. Strong Authentication: Password Improvements Plus MFA

**Priority**: High
**Effort**: Medium

**Why it matters**: Strong authentication is more effective when it reduces real compromise risk without pushing users into insecure behavior.

**Recommended password policy**:
- Minimum length of 12 characters
- Encourage passphrases instead of complex composition rules
- Block known common passwords
- Check against breached password datasets
- Keep short password history for reuse prevention
- Do not force routine 90-day rotation unless required by policy or incident response

**Recommended MFA rollout**:
- Require MFA for admins first
- Offer MFA to managers and staff next
- Support TOTP authenticator apps
- Provide one-time recovery codes

**Password validation example**:

```php
function validatePasswordStrength(string $password): array {
    $errors = [];

    if (strlen($password) < 12) {
        $errors[] = 'Password must be at least 12 characters long.';
    }

    if (preg_match('/^\d+$/', $password)) {
        $errors[] = 'Password cannot be entirely numeric.';
    }

    return $errors;
}
```

**Breached password check note**:
- The Have I Been Pwned k-anonymity API is a good fit here
- Cache responses where reasonable to avoid unnecessary latency

**Benefits**:
- Reduces account takeover risk
- Avoids brittle "uppercase/lowercase/symbol" rules
- MFA materially improves security for high-value accounts

---

### 8. Session Visibility And Revocation

**Priority**: Medium
**Effort**: Medium

**Why it matters**: Users and admins benefit from being able to see where accounts are active and revoke suspicious sessions.

**Recommended features**:
- Track active sessions in a `user_sessions` table
- Show session list with approximate device, IP, and last activity
- Let users revoke other sessions
- Provide "log out all devices"
- Rotate session IDs on login and privilege change

**Avoid as a primary control**:
- Hard device fingerprint binding based on headers alone

That approach is brittle, easy to spoof, and likely to log out legitimate users after browser updates, proxies, or locale changes.

**Safer session table example**:

```sql
CREATE TABLE user_sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Benefits**:
- Improves account visibility
- Limits damage from stolen devices
- Keeps security features user-friendly

---

### 9. Encryption At Rest For Sensitive Fields

**Priority**: Medium
**Effort**: High

**Why it matters**: Encryption at rest is useful when the system stores highly sensitive data that would significantly increase harm if the database were exposed.

**Encrypt fields like**:
- Government identifiers
- Bank or financial account numbers
- Medical or protected health data
- Private notes with sensitive content
- API credentials stored on behalf of users

**Do not encrypt blindly**:
- Encrypting everything increases complexity, hurts searchability, and complicates debugging
- Apply it to clearly defined high-risk fields

**Implementation guidance**:
- Use `aes-256-gcm`
- Store keys outside source control
- Support key versioning and rotation
- Audit decryption access where feasible

**Benefits**:
- Limits breach impact for high-risk records
- Supports regulatory controls where needed

---

### 10. Secure Data Export And Download Flows

**Priority**: Medium
**Effort**: Low-Medium

**Why it matters**: Exports are often where large amounts of sensitive data leave the system at once.

**Recommended controls**:
- Rate-limit exports
- Log every export with user, timestamp, IP, and record count
- Use short-lived signed download links
- Re-authenticate or re-check privileges for high-risk exports
- Watermark especially sensitive PDFs where appropriate

**Benefits**:
- Reduces bulk data exfiltration risk
- Improves auditability
- Supports compliance investigations

---

### 11. Dependency Security And Security Operations

**Priority**: Medium
**Effort**: Low-Medium

**Why it matters**: Many real-world incidents come from vulnerable packages, forgotten secrets, missing patches, or lack of alerting rather than from exotic attack chains.

**Recommended controls**:
- Run `npm audit` and `composer audit` in CI or scheduled checks
- Track outdated packages and patch regularly
- Add dependency update cadence
- Add error logging and security event alerting
- Test backups and restore procedures
- Document incident response basics

**Minimum operational checklist**:
- Quarterly dependency review
- Backup restore test at least periodically
- Review suspicious auth and export activity
- Rotate exposed secrets immediately

**Benefits**:
- Reduces supply-chain risk
- Improves recovery readiness
- Gives security work an operational backbone

---

### 12. Privacy, Retention, And Deletion Workflows

**Priority**: Medium
**Effort**: Medium-High

**Why it matters**: Privacy controls matter both for legal compliance and for minimizing how much sensitive data the system retains over time.

**Recommended scope**:
- Data retention policies by data category
- User data export for portability
- Deletion or anonymization workflows
- Consent management only if non-essential cookies or tracking are used

**Important implementation note**:
- Use prepared statements for privacy-related data access and deletion
- Do not directly interpolate IDs or dates into SQL queries

**Safer prepared-statement example**:

```php
$stmt = $db->prepare('DELETE FROM user_sessions WHERE user_id = ?');
$stmt->bind_param('i', $userId);
$stmt->execute();
```

**Benefits**:
- Reduces retained risk over time
- Supports legal and internal governance needs
- Makes data-handling decisions explicit

---

## Features To Narrow Or Defer

### API Request Signing

Keep this only for:
- Server-to-server requests
- Third-party partner APIs
- Webhook validation

Do not require browser clients to hold long-term signing secrets. That pattern is usually not appropriate for a public web frontend.

### Custom Regex-Based WAF Rules

Do not make a homegrown regex WAF the main line of defense. It often:
- Blocks legitimate input
- Generates false positives
- Requires constant tuning
- Creates a false sense of security

Prefer:
- Prepared statements
- Strict input validation
- Rate limiting
- Logging
- A managed WAF later if the app moves behind one

### Mandatory Password Rotation

Avoid routine forced password expiry for all users unless:
- A compliance policy explicitly requires it
- There is evidence of compromise
- A credential exposure incident occurs

Frequent forced rotation often leads to weaker password habits.

### SameSite=Strict Everywhere

Do not switch to `SameSite=Strict` globally without testing. It can break legitimate flows. Use:
- `SameSite=Lax` for the main session cookie
- CSRF tokens for state-changing requests

### Device Fingerprint Binding

Avoid binding sessions to a simplistic fingerprint made from request headers. It is unstable and easy to spoof.

---

## Updated Security Headers Guidance

Use modern headers that still provide value:

```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
```

**Note**:
- `X-XSS-Protection` is legacy and should not be relied on
- `X-Frame-Options` can still be added, but `frame-ancestors` in CSP is the stronger long-term control

---

## Revised Priority Matrix

### Phase 1: Implement Immediately
1. CORS allowlist and credential-safe handling
2. CSRF token protection
3. CSP in `Report-Only`, then enforce
4. File upload hardening
5. API response allowlists / serializers
6. Environment variables and secrets cleanup
7. Password improvements plus admin MFA

### Phase 2: Implement Next
8. Session visibility and revocation
9. Encryption at rest for sensitive fields
10. Secure data export and download controls
11. Dependency security and operational monitoring
12. Privacy, retention, and deletion workflows

### Phase 3: Implement Only If Needed
13. API request signing for non-browser integrations
14. API versioning for external consumers
15. Subresource Integrity for third-party hosted assets
16. Certificate pinning for a future mobile app

---

## Revised Implementation Timeline

| Phase | Scope | Estimated Effort |
|-------|-------|------------------|
| Phase 1 | 7 high-value controls | 3-5 weeks |
| Phase 2 | 5 medium-complexity controls | 4-6 weeks |
| Phase 3 | Conditional/future controls | As needed |

These estimates assume implementation, testing, rollout, and a short stabilization period. If the team is small or the codebase needs refactoring first, the real timeline may be longer.

---

## Additional Recommendations

### 1. Keep Prepared Statements In Every New Example

The application already uses prepared statements throughout. The proposal should model that same standard in all future implementation snippets.

### 2. Add MFA To The Real Roadmap

MFA is higher value for account protection than some of the lower-priority features from the earlier draft. Start with admins and other privileged roles.

### 3. Add Dependency And Secret Hygiene To Routine Maintenance

Security is not just headers and middleware. Include:
- dependency audits
- patching cadence
- secret rotation
- backup verification
- basic incident response notes

### 4. Validate Security Controls In Stages

After each phase:
- test login and session flows
- test upload rejection cases
- test CORS behavior from allowed and blocked origins
- review CSP reports before enforcing
- verify that responses never expose sensitive fields

---

## Conclusion

This revised plan is intentionally tighter and more practical than the earlier version. It keeps the strongest controls, removes or narrows the brittle ones, and focuses first on the changes that materially reduce risk in this application.

### Recommended Next Steps
1. Approve the revised Phase 1 scope
2. Implement CORS, CSRF, CSP, file upload hardening, response serializers, and secrets cleanup first
3. Add MFA for admins during the same phase or immediately after
4. Schedule a test pass after each phase
5. Revisit conditional items only when the product actually needs them
