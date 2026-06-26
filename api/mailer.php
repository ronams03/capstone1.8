<?php
/**
 * PHPMailer bootstrap + helper for sending emails (reset password / OTP)
 *
 * Uses SMTP credentials from environment variables.
 */

// Load Composer autoloader
$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (file_exists($vendorAutoload)) {
    require_once $vendorAutoload;
}

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

function isValidGmailAddress($email) {
    $value = trim((string)$email);
    if ($value === '') return false;
    if (!filter_var($value, FILTER_VALIDATE_EMAIL)) return false;
    return (bool)preg_match('/@(gmail\.com|phinmaed\.com)$/i', $value);
}

function resolveEmailBrandLogoPath() {
    $projectRoot = realpath(__DIR__ . '/..');
    if ($projectRoot === false) {
        return '';
    }

    $rawCandidate = trim((string)(getenv('MAIL_BRAND_LOGO_PATH') ?: getenv('BRAND_LOGO_PATH') ?: ''));
    $candidates = [];

    if ($rawCandidate !== '') {
        $normalized = str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rawCandidate);
        $candidates[] = $normalized;
        $candidates[] = $projectRoot . DIRECTORY_SEPARATOR . ltrim($normalized, DIRECTORY_SEPARATOR);
    }

    $candidates[] = $projectRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'logo.png';
    $candidates[] = $projectRoot . DIRECTORY_SEPARATOR . 'public' . DIRECTORY_SEPARATOR . 'logo_v2.png';

    foreach ($candidates as $candidate) {
        $path = trim((string)$candidate);
        if ($path === '') {
            continue;
        }

        $realPath = realpath($path);
        if ($realPath !== false && is_file($realPath) && is_readable($realPath)) {
            return $realPath;
        }
    }

    return '';
}

function getEmailBranding() {
    $brandName = trim((string)(getenv('MAIL_BRAND_NAME') ?: getenv('SMTP_FROM_NAME') ?: 'LLB Accountants'));
    $supportEmail = trim((string)(getenv('SMTP_FROM_EMAIL') ?: getenv('SMTP_USERNAME') ?: ''));
    $logoUrl = trim((string)(getenv('MAIL_BRAND_LOGO_URL') ?: getenv('BRAND_LOGO_URL') ?: ''));
    $logoPath = resolveEmailBrandLogoPath();
    $logoCid = $logoPath !== '' ? 'brand-logo' : '';

    if ($logoUrl === '') {
        $frontendBase = trim((string)(getenv('FRONTEND_BASE_URL') ?: ''));
        if ($frontendBase !== '') {
            $logoUrl = rtrim($frontendBase, '/') . '/logo.png';
        } else {
            $isHttps = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
            $scheme = $isHttps ? 'https' : 'http';
            $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
            if ($host !== '') {
                $logoUrl = $scheme . '://' . $host . '/capstone1/logo.png';
            }
        }
    }

    return [
        'brand_name' => $brandName !== '' ? $brandName : 'LLB Accountants',
        'logo_path' => $logoPath,
        'logo_cid' => $logoCid,
        'logo_url' => $logoUrl,
        'support_email' => $supportEmail,
        'year' => date('Y'),
    ];
}

function buildBrandedEmailLayout($contentHtml, $preheader = '') {
    $branding = getEmailBranding();
    $safeBrandName = htmlspecialchars((string)$branding['brand_name'], ENT_QUOTES, 'UTF-8');
    $logoPath = trim((string)($branding['logo_path'] ?? ''));
    $logoCid = trim((string)($branding['logo_cid'] ?? ''));
    $safeLogoUrl = htmlspecialchars((string)$branding['logo_url'], ENT_QUOTES, 'UTF-8');
    $safeSupportEmail = htmlspecialchars((string)$branding['support_email'], ENT_QUOTES, 'UTF-8');
    $safePreheader = htmlspecialchars((string)$preheader, ENT_QUOTES, 'UTF-8');
    $year = htmlspecialchars((string)$branding['year'], ENT_QUOTES, 'UTF-8');

    $logoSrc = '';
    if ($logoPath !== '' && $logoCid !== '') {
        $logoSrc = 'cid:' . $logoCid;
    } elseif ($safeLogoUrl !== '') {
        $logoSrc = html_entity_decode($safeLogoUrl, ENT_QUOTES, 'UTF-8');
    }

    $logoBlock = '';
    if ($logoSrc !== '') {
        $logoBlock = '<img src="' . htmlspecialchars($logoSrc, ENT_QUOTES, 'UTF-8') . '" alt="' . $safeBrandName . ' Logo" width="64" height="64" '
            . 'style="display:block;width:64px;height:64px;border:0;outline:none;text-decoration:none;margin:0 auto 10px auto;">';
    }

    $supportLine = '';
    if ($safeSupportEmail !== '') {
        $supportLine = '<p style="margin:8px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">'
            . 'For assistance, contact <a href="mailto:' . $safeSupportEmail . '" style="color:#1d4ed8;text-decoration:none;">'
            . $safeSupportEmail . '</a>.</p>';
    }

    return '<div style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Arial,sans-serif;color:#111827;">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' . $safePreheader . '</div>'
        . '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 12px;background:#f4f6fb;">'
        . '<tr><td align="center">'
        . '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" '
        . 'style="max-width:680px;background:#ffffff;border:1px solid #dbe3ef;border-radius:12px;overflow:hidden;">'
        . '<tr><td style="background:#0f2d74;padding:16px 24px;color:#ffffff;">'
        . '<div style="font-size:18px;line-height:1.2;font-weight:700;">' . $safeBrandName . '</div>'
        . '<div style="margin-top:4px;font-size:12px;line-height:1.4;opacity:0.92;">Client Communication</div>'
        . '</td></tr>'
        . '<tr><td style="padding:22px 24px 8px 24px;text-align:center;">'
        . $logoBlock
        . '<div style="font-size:16px;line-height:1.4;font-weight:700;color:#111827;">' . $safeBrandName . '</div>'
        . '</td></tr>'
        . '<tr><td style="padding:10px 24px 20px 24px;">' . $contentHtml . '</td></tr>'
        . '<tr><td style="border-top:1px solid #e5e7eb;padding:14px 24px;background:#f9fafb;">'
        . '<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">&copy; ' . $year . ' ' . $safeBrandName . '. All rights reserved.</p>'
        . $supportLine
        . '</td></tr>'
        . '</table>'
        . '</td></tr>'
        . '</table>'
        . '</div>';
}

/**
 * Send an email using PHPMailer via SMTP.
 *
 * Returns true on success, false on failure.
 */
function sendMail($toEmail, $toName, $subject, $htmlBody, $altBody = '', $attachments = []) {
    // If PHPMailer isn't installed (vendor/autoload.php missing), fail gracefully.
    if (!class_exists('PHPMailer\\PHPMailer\\PHPMailer')) {
        error_log('sendMail failed: PHPMailer is not installed. Run: composer require phpmailer/phpmailer');
        return false;
    }

    // SMTP configuration from environment
    $smtpHostRaw = trim((string)(getenv('SMTP_HOST') ?: 'smtp.gmail.com'));
    $smtpPortRaw = trim((string)(getenv('SMTP_PORT') ?: '587'));
    $smtpUser = trim((string)(getenv('SMTP_USERNAME') ?: getenv('GMAIL_USERNAME') ?: 'kristinedais01@gmail.com'));
    $smtpPassRaw = (string)(getenv('SMTP_PASSWORD') ?: getenv('GMAIL_APP_PASSWORD') ?: 'iqiwypyaispcdgyo');
    // Google app passwords are often copied with spaces; normalize to contiguous text.
    $smtpPass = preg_replace('/\s+/', '', $smtpPassRaw);
    $fromEmail = trim((string)(getenv('SMTP_FROM_EMAIL') ?: $smtpUser));
    $fromName = trim((string)(getenv('SMTP_FROM_NAME') ?: 'LLB Accountants'));
    $smtpEncryptionRaw = strtolower(trim((string)(getenv('SMTP_ENCRYPTION') ?: 'tls')));
    $smtpDebugRaw = trim((string)(getenv('SMTP_DEBUG') ?: '0'));

    $smtpHost = $smtpHostRaw !== '' ? $smtpHostRaw : 'smtp.gmail.com';
    $smtpPort = is_numeric($smtpPortRaw) ? (int)$smtpPortRaw : 587;
    if ($smtpPort <= 0) $smtpPort = 587;

    if ($smtpUser === '' || $smtpPass === '' || $fromEmail === '') {
        error_log('sendMail failed: missing SMTP credentials. Set SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM_EMAIL.');
        return false;
    }

    // Enforce allowed sender domains for SMTP credentials.
    if (!isValidGmailAddress($smtpUser)) {
        error_log('sendMail failed: SMTP_USERNAME must be a valid @gmail.com or @phinmaed.com address.');
        return false;
    }
    if (!isValidGmailAddress($fromEmail)) {
        error_log('sendMail failed: SMTP_FROM_EMAIL must be a valid @gmail.com or @phinmaed.com address.');
        return false;
    }

    $smtpDebug = is_numeric($smtpDebugRaw) ? (int)$smtpDebugRaw : 0;
    if ($smtpDebug < 0) $smtpDebug = 0;
    if ($smtpDebug > 4) $smtpDebug = 4;

    $smtpSecure = PHPMailer::ENCRYPTION_STARTTLS;
    if ($smtpEncryptionRaw === 'ssl' || $smtpEncryptionRaw === 'smtps') {
        $smtpSecure = PHPMailer::ENCRYPTION_SMTPS;
        if ((int)$smtpPort === 587) $smtpPort = 465;
    } elseif ($smtpEncryptionRaw === 'none' || $smtpEncryptionRaw === 'off' || $smtpEncryptionRaw === 'false') {
        $smtpSecure = '';
    }

    try {
        $mail = new PHPMailer(true);

        // SMTP debug: 0 for production, 2+ for troubleshooting
        $mail->SMTPDebug  = $smtpDebug;
        $mail->Debugoutput = function($str, $level) {
            error_log("PHPMailer [{$level}]: {$str}");
        };

        $mail->isSMTP();
        $mail->Host       = $smtpHost;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtpUser;
        $mail->Password   = $smtpPass;
        $mail->Port       = $smtpPort;
        if ($smtpSecure !== '') {
            $mail->SMTPSecure = $smtpSecure;
        } else {
            $mail->SMTPAutoTLS = false;
        }
        $mail->Timeout    = 90; // 90 second timeout (increased for large attachments)
        $mail->SMTPKeepAlive = false; // Don't keep connection open (single send per request)

        $mail->CharSet = 'UTF-8';
        $mail->setFrom($fromEmail, $fromName);
        $mail->addAddress($toEmail, $toName ?: $toEmail);

        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = $altBody ?: strip_tags($htmlBody);

        $branding = function_exists('getEmailBranding') ? getEmailBranding() : [];
        $logoPath = trim((string)($branding['logo_path'] ?? ''));
        $logoCid = trim((string)($branding['logo_cid'] ?? 'brand-logo'));
        if (
            $logoPath !== ''
            && $logoCid !== ''
            && is_file($logoPath)
            && stripos($htmlBody, 'cid:' . $logoCid) !== false
        ) {
            $logoMime = function_exists('mime_content_type') ? (string)(mime_content_type($logoPath) ?: '') : '';
            if ($logoMime === '') {
                $logoMime = 'image/png';
            }
            $mail->addEmbeddedImage(
                $logoPath,
                $logoCid,
                basename($logoPath),
                PHPMailer::ENCODING_BASE64,
                $logoMime
            );
        }

        if (is_array($attachments)) {
            foreach ($attachments as $attachment) {
                if (is_string($attachment)) {
                    $path = trim($attachment);
                    if ($path !== '' && is_file($path)) {
                        $mail->addAttachment($path);
                    }
                    continue;
                }

                if (!is_array($attachment)) {
                    continue;
                }

                $content = array_key_exists('content', $attachment) ? (string)($attachment['content'] ?? '') : '';
                $name = trim((string)($attachment['name'] ?? ''));
                $mime = trim((string)($attachment['mime'] ?? ''));
                if ($content !== '') {
                    $mail->addStringAttachment(
                        $content,
                        $name !== '' ? $name : 'attachment',
                        PHPMailer::ENCODING_BASE64,
                        $mime !== '' ? $mime : 'application/octet-stream'
                    );
                    continue;
                }

                $path = trim((string)($attachment['path'] ?? ''));
                if ($path === '' || !is_file($path)) {
                    continue;
                }

                if ($mime !== '') {
                    $mail->addAttachment($path, $name !== '' ? $name : '', PHPMailer::ENCODING_BASE64, $mime);
                } elseif ($name !== '') {
                    $mail->addAttachment($path, $name);
                } else {
                    $mail->addAttachment($path);
                }
            }
        }

        $result = $mail->send();
        if (!$result) {
            error_log('sendMail: send() returned false. ErrorInfo: ' . $mail->ErrorInfo);
        }
        return $result;
    } catch (Exception $e) {
        error_log('sendMail failed: ' . $mail->ErrorInfo . ' | Exception: ' . $e->getMessage());
        return false;
    } catch (\Exception $e) {
        error_log('sendMail failed (general): ' . $e->getMessage());
        return false;
    }
}

/**
 * Build a premium payslip release email for employees.
 * Dark navy/gold aesthetic with payslip summary card.
 *
 * @param string $employeeName Employee's first name or full name
 * @param string $payPeriodStart Start date of pay period (Y-m-d format)
 * @param string $payPeriodEnd End date of pay period (Y-m-d format)
 * @param float $grossPay Gross pay amount
 * @param float $deductions Total deductions amount
 * @param float $netPay Net pay amount
 * @param string $baseUrl Frontend base URL for links
 * @return string Complete HTML email with wrapper
 */
function buildPayslipReleaseEmail($employeeName, $payPeriodStart, $payPeriodEnd, $grossPay, $deductions, $netPay, $baseUrl) {
    // Extract first name from full name if needed
    $firstName = $employeeName;
    if (strpos($employeeName, ' ') !== false) {
        $nameParts = explode(' ', trim($employeeName));
        $firstName = $nameParts[0];
    }

    // Format dates
    $formattedPeriodStart = date('F j, Y', strtotime($payPeriodStart));
    $formattedPeriodEnd = date('F j, Y', strtotime($payPeriodEnd));
    $payPeriodRange = $formattedPeriodStart . ' - ' . $formattedPeriodEnd;
    $payPeriodShort = date('F j', strtotime($payPeriodStart)) . ' - ' . date('F j, Y', strtotime($payPeriodEnd));

    // Format money values
    $formattedGrossPay = '₱' . number_format($grossPay, 2);
    $formattedDeductions = '₱' . number_format($deductions, 2);
    $formattedNetPay = '₱' . number_format($netPay, 2);

    // Build the premium inner HTML content
    $innerHtml = '
    <!-- Hero Banner Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a1628;">
        <tr>
            <td style="padding:40px 24px;text-align:center;">
                <!-- Brand Name -->
                <p style="margin:0 0 16px 0;font-size:11px;font-weight:600;letter-spacing:3px;color:#c9a84c;text-transform:uppercase;">LLB ACCOUNTANTS</p>
                
                <!-- Main Heading -->
                <h1 style="margin:0 0 20px 0;font-family:Georgia, \'Times New Roman\', serif;font-size:28px;font-weight:700;line-height:1.3;color:#c9a84c;">YOUR PAYSLIP HAS BEEN RELEASED</h1>
                
                <!-- Gold Divider Line -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:60px;">
                    <tr>
                        <td style="height:1px;background:#c9a84c;"></td>
                    </tr>
                </table>
                
                <!-- Pay Period -->
                <p style="margin:20px 0 0 0;font-size:14px;color:#8896ab;">' . htmlspecialchars($payPeriodShort, ENT_QUOTES, 'UTF-8') . '</p>
            </td>
        </tr>
    </table>
    
    <!-- Content Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;">
        <tr>
            <td style="padding:32px 24px;">
                <!-- Greeting -->
                <p style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:#1a202c;">Dear ' . htmlspecialchars($firstName, ENT_QUOTES, 'UTF-8') . ',</p>
                
                <!-- Intro Paragraph -->
                <p style="margin:0 0 28px 0;font-size:15px;line-height:1.7;color:#4a5568;">We are pleased to inform you that your compensation for the period below has been processed and is now available for your review.</p>
                
                <!-- Payslip Summary Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
                    <tr>
                        <td style="padding:24px;">
                            <!-- Pay Period Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:14px;color:#64748b;">Pay Period</td>
                                    <td style="padding:8px 0;font-size:14px;font-weight:500;color:#1a202c;text-align:right;">' . htmlspecialchars($payPeriodRange, ENT_QUOTES, 'UTF-8') . '</td>
                                </tr>
                            </table>
                            
                            <!-- Gross Pay Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:14px;color:#64748b;">Gross Pay</td>
                                    <td style="padding:8px 0;font-size:14px;font-weight:600;color:#1a202c;text-align:right;">' . $formattedGrossPay . '</td>
                                </tr>
                            </table>
                            
                            <!-- Thin Divider -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:12px 0;">
                                <tr>
                                    <td style="height:1px;background:#e2e8f0;"></td>
                                </tr>
                            </table>
                            
                            <!-- Deductions Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:14px;color:#64748b;">Deductions</td>
                                    <td style="padding:8px 0;font-size:14px;font-weight:500;color:#dc2626;text-align:right;">' . $formattedDeductions . '</td>
                                </tr>
                            </table>
                            
                            <!-- Thick Gold Divider -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:16px 0;">
                                <tr>
                                    <td style="height:2px;background:#c9a84c;"></td>
                                </tr>
                            </table>
                            
                            <!-- Net Pay Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:16px;font-weight:700;color:#1a202c;">NET PAY</td>
                                    <td style="padding:8px 0;font-size:22px;font-weight:700;color:#c9a84c;text-align:right;">' . $formattedNetPay . '</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                
                <!-- CTA Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto 0 auto;">
                    <tr>
                        <td>
                            <a href="' . htmlspecialchars(rtrim($baseUrl, '/') . '/my-payslips', ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;background:#c9a84c;color:#0a1628;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:8px;">View Your Payslip</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    
    <!-- Footer Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;">
        <tr>
            <td style="padding:24px;text-align:center;">
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;">This payslip is confidential and intended solely for the named recipient.</p>
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;">If you have questions, please contact your HR department.</p>
                <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;">© ' . date('Y') . ' LLB Accountants. All rights reserved.</p>
            </td>
        </tr>
    </table>';

    // Create preheader text
    $preheader = 'Your payslip for ' . $payPeriodShort . ' is now available';

    // Wrap with branded layout
    return buildBrandedEmailLayout($innerHtml, $preheader);
}

/**
 * Build a premium payslip release notification email for admins/managers.
 * Dark navy/gold aesthetic, simplified content (no financial details).
 *
 * @param string $employeeName Employee's full name
 * @param string $payPeriodStart Start date of pay period (Y-m-d format)
 * @param string $payPeriodEnd End date of pay period (Y-m-d format)
 * @param string $baseUrl Frontend base URL for links
 * @return string Complete HTML email with wrapper
 */
function buildPayslipReleaseAdminEmail($employeeName, $payPeriodStart, $payPeriodEnd, $baseUrl) {
    // Format dates
    $formattedPeriodStart = date('F j, Y', strtotime($payPeriodStart));
    $formattedPeriodEnd = date('F j, Y', strtotime($payPeriodEnd));
    $payPeriodRange = $formattedPeriodStart . ' - ' . $formattedPeriodEnd;

    // Build the premium inner HTML content
    $innerHtml = '
    <!-- Hero Banner Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0a1628;">
        <tr>
            <td style="padding:40px 24px;text-align:center;">
                <!-- Brand Name -->
                <p style="margin:0 0 16px 0;font-size:11px;font-weight:600;letter-spacing:3px;color:#c9a84c;text-transform:uppercase;">LLB ACCOUNTANTS</p>
                
                <!-- Main Heading -->
                <h1 style="margin:0 0 20px 0;font-family:Georgia, \'Times New Roman\', serif;font-size:26px;font-weight:700;line-height:1.3;color:#c9a84c;">PAYSLIP RELEASE NOTIFICATION</h1>
                
                <!-- Gold Divider Line -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:60px;">
                    <tr>
                        <td style="height:1px;background:#c9a84c;"></td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    
    <!-- Content Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;">
        <tr>
            <td style="padding:32px 24px;">
                <!-- Intro Paragraph -->
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#4a5568;">A payslip has been released for the following employee:</p>
                
                <!-- Employee Info Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
                    <tr>
                        <td style="padding:24px;">
                            <!-- Employee Name Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:14px;color:#64748b;">Employee Name</td>
                                    <td style="padding:8px 0;font-size:14px;font-weight:600;color:#1a202c;text-align:right;">' . htmlspecialchars($employeeName, ENT_QUOTES, 'UTF-8') . '</td>
                                </tr>
                            </table>
                            
                            <!-- Thin Divider -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0;">
                                <tr>
                                    <td style="height:1px;background:#e2e8f0;"></td>
                                </tr>
                            </table>
                            
                            <!-- Pay Period Row -->
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td style="padding:8px 0;font-size:14px;color:#64748b;">Pay Period</td>
                                    <td style="padding:8px 0;font-size:14px;font-weight:500;color:#1a202c;text-align:right;">' . htmlspecialchars($payPeriodRange, ENT_QUOTES, 'UTF-8') . '</td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
                
                <!-- CTA Button -->
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto 0 auto;">
                    <tr>
                        <td>
                            <a href="' . htmlspecialchars(rtrim($baseUrl, '/') . '/payroll-management', ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;background:#c9a84c;color:#0a1628;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:8px;">View Payroll Management</a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
    
    <!-- Footer Section -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;">
        <tr>
            <td style="padding:24px;text-align:center;">
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;">This notification is confidential and intended for authorized personnel only.</p>
                <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#64748b;">If you have questions, please contact the payroll department.</p>
                <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;">© ' . date('Y') . ' LLB Accountants. All rights reserved.</p>
            </td>
        </tr>
    </table>';

    // Create preheader text
    $preheader = 'Payslip release notification for ' . $employeeName;

    // Wrap with branded layout
    return buildBrandedEmailLayout($innerHtml, $preheader);
}

?>
