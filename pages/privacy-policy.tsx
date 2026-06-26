import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PRIVACY_POLICY_DEFAULT_HTML } from '@/utils/privacyPolicyDefaultHtml';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

const clampWatermarkCount = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(6, Math.trunc(parsed)));
};

const privacyPolicyHtml = PRIVACY_POLICY_DEFAULT_HTML;

export default function PrivacyPolicyPage() {
  const { basePath } = useRouter();
  const assetBasePath = basePath || '';
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [watermarkCount, setWatermarkCount] = useState(3);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/settings_api.php?action=public_privacy_policy_settings`);
        const data = await res.json();
        if (!cancelled && data?.success) {
          const enabled = data?.data?.privacy_policy_watermark_enabled;
          const count = data?.data?.privacy_policy_watermark_count;
          setWatermarkEnabled(enabled === undefined ? true : Boolean(enabled));
          setWatermarkCount(clampWatermarkCount(count));
        }
      } catch {
        // Keep fallback defaults if settings endpoint is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const watermarkPositions = useMemo(
    () => Array.from({ length: watermarkCount }, (_, index) => `${((index + 1) / (watermarkCount + 1)) * 100}%`),
    [watermarkCount]
  );

  const watermarkWidth = watermarkCount >= 5 ? '46%' : watermarkCount >= 4 ? '52%' : '58%';

  return (
    <>
      <Head>
        <title>Privacy Policy | LLB Accountants</title>
      </Head>

      <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '24px 16px' }}>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            maxWidth: 960,
            margin: '0 auto',
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            padding: 24,
            lineHeight: 1.6,
            color: '#111827',
          }}
        >
          {watermarkEnabled && (
            <div
              aria-hidden="true"
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                inset: 0,
                zIndex: 0,
              }}
            >
              {watermarkPositions.map((topPosition, index) => (
                <div
                  key={`wm-${index}`}
                  style={{
                    position: 'absolute',
                    top: topPosition,
                    left: '50%',
                    width: watermarkWidth,
                    maxWidth: 520,
                    aspectRatio: '1 / 1',
                    transform: 'translate(-50%, -50%) rotate(-18deg)',
                    opacity: index % 2 === 0 ? 0.06 : 0.07,
                    filter: 'grayscale(100%)',
                    backgroundImage: `url('${assetBasePath}/logo_v2.png')`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    backgroundSize: 'contain',
                  }}
                />
              ))}
            </div>
          )}

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ marginBottom: 16 }}>
              <Link
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  color: '#1e3a8a',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to login
              </Link>
            </div>
            <div dangerouslySetInnerHTML={{ __html: privacyPolicyHtml }} />
          </div>
        </div>
      </main>
    </>
  );
}
