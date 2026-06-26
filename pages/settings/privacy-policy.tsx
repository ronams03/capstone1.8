import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import CrudActionIcon from '../../components/CrudActionIcon';
import SettingsLayout from '../../components/SettingsLayout';
import { SettingsPageHeader } from '../../components/SettingsPageShell';
import { useAdminSettingsPage } from '../../components/useAdminSettingsPage';
import { notifyError, notifySuccess } from '@/utils/notify';
import { PRIVACY_POLICY_DEFAULT_HTML } from '@/utils/privacyPolicyDefaultHtml';
import { getApiBaseUrl } from '@/utils/network';

const API_BASE = getApiBaseUrl();

const clampWatermarkCount = (value: number) => {
    if (Number.isNaN(value)) return 3;
    return Math.max(1, Math.min(6, Math.trunc(value)));
};

const formatDateTime = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Not published yet';
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString();
};

export default function PrivacyPolicySettingsPage() {
    const router = useRouter();
    const embedded = true;
    const assetBasePath = router.basePath || '';
    const { user, loading: authLoading, logout } = useAdminSettingsPage();
    const [pageLoading, setPageLoading] = useState(true);

    const [watermarkEnabled, setWatermarkEnabled] = useState(true);
    const [watermarkCount, setWatermarkCount] = useState(3);

    const [draftHtml, setDraftHtml] = useState('');
    const [publishedHtml, setPublishedHtml] = useState('');
    const [publishedAt, setPublishedAt] = useState('');
    const [sourceFilename, setSourceFilename] = useState('');
    const [sourceFiletype, setSourceFiletype] = useState('');
    const [sourceUploadedAt, setSourceUploadedAt] = useState('');
    const [uploadWarning, setUploadWarning] = useState('');

    const [savingDisplay, setSavingDisplay] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [resettingDefault, setResettingDefault] = useState(false);
    const [isDraftPreviewOpen, setIsDraftPreviewOpen] = useState(false);
    const [isDraftEditing, setIsDraftEditing] = useState(false);

    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading || !user) return;

        let active = true;
        const loadPage = async () => {
            try {
                await fetchEditorData();
            } finally {
                if (active) {
                    setPageLoading(false);
                }
            }
        };

        void loadPage();
        return () => {
            active = false;
        };
    }, [authLoading, user]);

    useEffect(() => {
        if (!msg) return;
        void notifySuccess(msg);
        setMsg(null);
    }, [msg]);

    useEffect(() => {
        if (!err) return;
        void notifyError(err);
        setErr(null);
    }, [err]);

    useEffect(() => {
        if (!isDraftPreviewOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsDraftPreviewOpen(false);
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isDraftPreviewOpen]);

    const fetchEditorData = async () => {
        try {
            const res = await fetch(`${API_BASE}/privacy_policy_api.php?action=admin_get`, { credentials: 'include' });
            const data = await res.json();

            if (!data.success || !data.data) {
                setErr(data.message || 'Failed to load privacy policy editor data.');
                return;
            }

            setDraftHtml(String(data.data.draft_html || ''));
            setPublishedHtml(String(data.data.published_html || ''));
            setPublishedAt(String(data.data.published_at || ''));
            setSourceFilename(String(data.data.source_filename || ''));
            setSourceFiletype(String(data.data.source_filetype || ''));
            setSourceUploadedAt(String(data.data.source_uploaded_at || ''));
            setWatermarkEnabled(Boolean(data.data.watermark_enabled ?? true));
            setWatermarkCount(clampWatermarkCount(Number(data.data.watermark_count ?? 3)));
        } catch {
            setErr('Network error while loading privacy policy editor.');
        }
    };

    const handleSaveDisplay = async () => {
        setSavingDisplay(true);
        setErr(null);
        setMsg(null);

        const normalizedCount = clampWatermarkCount(watermarkCount);
        setWatermarkCount(normalizedCount);

        try {
            const res = await fetch(`${API_BASE}/settings_api.php`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    settings: {
                        privacy_policy_watermark_enabled: watermarkEnabled,
                        privacy_policy_watermark_count: normalizedCount,
                    },
                }),
            });

            const data = await res.json();
            if (data.success) {
                setMsg('Privacy policy display settings saved.');
            } else {
                setErr(data.message || 'Failed to save display settings.');
            }
        } catch {
            setErr('Network error while saving display settings.');
        } finally {
            setSavingDisplay(false);
        }
    };

    const handleSaveDraft = async () => {
        setSavingDraft(true);
        setErr(null);
        setMsg(null);

        try {
            const res = await fetch(`${API_BASE}/privacy_policy_api.php?action=save_draft`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ html: draftHtml }),
            });

            const data = await res.json();
            if (data.success) {
                setDraftHtml(String(data.data?.draft_html || draftHtml));
                setMsg('Draft saved.');
            } else {
                setErr(data.message || 'Failed to save draft.');
            }
        } catch {
            setErr('Network error while saving draft.');
        } finally {
            setSavingDraft(false);
        }
    };

    const handlePublish = async () => {
        setPublishing(true);
        setErr(null);
        setMsg(null);

        try {
            const res = await fetch(`${API_BASE}/privacy_policy_api.php?action=publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ html: draftHtml }),
            });

            const data = await res.json();
            if (data.success) {
                setPublishedHtml(String(data.data?.published_html || draftHtml));
                setPublishedAt(String(data.data?.published_at || ''));
                setMsg('Privacy policy published successfully.');
            } else {
                setErr(data.message || 'Failed to publish privacy policy.');
            }
        } catch {
            setErr('Network error while publishing.');
        } finally {
            setPublishing(false);
        }
    };

    const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        setUploading(true);
        setErr(null);
        setMsg(null);
        setUploadWarning('');

        try {
            const formData = new FormData();
            formData.append('policy_file', file);

            const res = await fetch(`${API_BASE}/privacy_policy_api.php?action=upload_import`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            const data = await res.json();
            if (data.success && data.data) {
                setDraftHtml(String(data.data.draft_html || ''));
                setSourceFilename(String(data.data.source_filename || file.name));
                setSourceFiletype(String(data.data.source_filetype || file.name.split('.').pop() || ''));
                setSourceUploadedAt(String(data.data.source_uploaded_at || ''));
                setUploadWarning(String(data.data.warning || ''));
                setMsg('Document imported into draft. Review and edit before publishing.');
            } else {
                setErr(data.message || 'Failed to import file.');
            }
        } catch {
            setErr('Network error while uploading file.');
        } finally {
            setUploading(false);
        }
    };

    const handleLoadPublishedToDraft = () => {
        setDraftHtml(publishedHtml || '');
        setMsg('Loaded published content into draft editor.');
    };

    const handleResetToDefault = async () => {
        const shouldReset = window.confirm(
            'Restore the default privacy policy and publish it now? This will overwrite the current draft and published policy.'
        );
        if (!shouldReset) return;

        setResettingDefault(true);
        setErr(null);
        setMsg(null);
        setUploadWarning('');

        try {
            const res = await fetch(`${API_BASE}/privacy_policy_api.php?action=publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ html: PRIVACY_POLICY_DEFAULT_HTML }),
            });

            const data = await res.json();
            if (data.success) {
                setDraftHtml(PRIVACY_POLICY_DEFAULT_HTML);
                setPublishedHtml(String(data.data?.published_html || PRIVACY_POLICY_DEFAULT_HTML));
                setPublishedAt(String(data.data?.published_at || ''));
                setMsg('Default privacy policy restored and published.');
            } else {
                setErr(data.message || 'Failed to restore default policy.');
            }
        } catch {
            setErr('Network error while restoring default policy.');
        } finally {
            setResettingDefault(false);
        }
    };

    const previewHtml = useMemo(() => {
        const value = String(draftHtml || '').trim();
        if (value) return value;
        return '<p style="color:#6b7280;">Draft is empty.</p>';
    }, [draftHtml]);

    const previewWatermarkPositions = useMemo(
        () => Array.from({ length: watermarkCount }, (_, index) => `${((index + 1) / (watermarkCount + 1)) * 100}%`),
        [watermarkCount]
    );

    const previewWatermarkWidth = watermarkCount >= 5 ? '46%' : watermarkCount >= 4 ? '52%' : '58%';

    if (authLoading || pageLoading) {
        return (
            <SettingsLayout activeSection="privacy-policy" user={user} onLogout={logout}>
                <div style={{ padding: 20 }}>Loading...</div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout activeSection="privacy-policy" user={user} onLogout={logout}>
            <SettingsPageHeader embedded={embedded} title="Privacy Policy Settings" onBack={() => router.push('/settings')} />

            <div style={{ display: 'grid', gap: 20 }}>
                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                        <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>Display Controls</h2>
                        <p style={{ margin: '0 0 18px 0', fontSize: 13, color: '#6b7280' }}>
                            Configure watermark behavior on the public privacy policy page.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                            <label style={{ fontSize: 14, color: '#374151', fontWeight: 600, minWidth: 180 }}>Enable Watermark</label>
                            <button
                                type="button"
                                onClick={() => setWatermarkEnabled((prev) => !prev)}
                                style={{
                                    width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                                    background: watermarkEnabled ? '#1e3a8a' : '#d1d5db',
                                    position: 'relative', transition: 'background 0.2s',
                                }}
                            >
                                <div
                                    style={{
                                        width: 20, height: 20, borderRadius: '50%', background: '#fff',
                                        position: 'absolute', top: 3,
                                        left: watermarkEnabled ? 25 : 3,
                                        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    }}
                                />
                            </button>
                            <span style={{ fontSize: 12, color: watermarkEnabled ? '#166534' : '#9ca3af', fontWeight: 600 }}>
                                {watermarkEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>

                        {watermarkEnabled && (
                            <div style={{ display: 'grid', gap: 6, maxWidth: 260 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Watermark Count</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={watermarkCount}
                                    onChange={(e) => setWatermarkCount(clampWatermarkCount(Number(e.target.value)))}
                                    style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 14, color: '#111' }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>Allowed range: 1 to 6</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                            <button
                                onClick={handleSaveDisplay}
                                disabled={savingDisplay}
                                title="Save display settings"
                                aria-label="Save display settings"
                                style={{
                                    background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 20px',
                                    borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                                    opacity: savingDisplay ? 0.7 : 1,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                {savingDisplay ? 'Saving...' : 'Submit'}
                            </button>
                        </div>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
                        <h2 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#111827' }}>Policy Content Editor</h2>
                        <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#6b7280' }}>
                            Upload a PDF, TXT, or DOCX file to import a draft, edit the content, then publish when ready.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                            <label
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db',
                                    cursor: uploading ? 'not-allowed' : 'pointer',
                                    color: '#1e3a8a', fontWeight: 600, fontSize: 13,
                                    opacity: uploading ? 0.65 : 1,
                                }}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                {uploading ? 'Importing...' : 'Upload Policy File'}
                                <input
                                    type="file"
                                    accept=".pdf,.txt,.docx"
                                    onChange={handleImportFile}
                                    disabled={uploading}
                                    style={{ display: 'none' }}
                                />
                            </label>

                            <button
                                type="button"
                                onClick={handleLoadPublishedToDraft}
                                style={{
                                    background: '#f8fafc', border: '1px solid #d1d5db', borderRadius: 8,
                                    padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#334155',
                                }}
                            >
                                Use Published as Draft
                            </button>

                            <button
                                type="button"
                                onClick={handleResetToDefault}
                                disabled={resettingDefault}
                                style={{
                                    background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
                                    padding: '8px 12px', cursor: resettingDefault ? 'not-allowed' : 'pointer',
                                    fontSize: 13, fontWeight: 700, color: '#b91c1c',
                                    opacity: resettingDefault ? 0.7 : 1,
                                }}
                            >
                                {resettingDefault ? 'Restoring...' : 'Reset to Default'}
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsDraftPreviewOpen(true)}
                                style={{
                                    background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8,
                                    padding: '8px 12px', cursor: 'pointer',
                                    fontSize: 13, fontWeight: 700, color: '#1d4ed8',
                                }}
                            >
                                Draft Preview
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsDraftEditing((prev) => !prev)}
                                style={{
                                    background: isDraftEditing ? '#fef3c7' : '#dcfce7',
                                    border: `1px solid ${isDraftEditing ? '#fcd34d' : '#86efac'}`,
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: isDraftEditing ? '#92400e' : '#166534',
                                }}
                            >
                                {isDraftEditing ? 'Stop Editing' : 'Edit Draft'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <strong>Source file:</strong> {sourceFilename || 'None'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <strong>Type:</strong> {sourceFiletype || 'N/A'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <strong>Imported at:</strong> {sourceUploadedAt ? formatDateTime(sourceUploadedAt) : 'N/A'}
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <strong>Published at:</strong> {formatDateTime(publishedAt)}
                            </div>
                            {uploadWarning && (
                                <div style={{ marginTop: 4, fontSize: 12, color: '#b45309' }}>
                                    {uploadWarning}
                                </div>
                            )}
                        </div>

                        {isDraftEditing ? (
                            <div style={{ display: 'grid', gap: 8 }}>
                                <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Draft HTML Content</label>
                                <textarea
                                    value={draftHtml}
                                    onChange={(e) => setDraftHtml(e.target.value)}
                                    style={{
                                        width: '100%', minHeight: 460, resize: 'vertical',
                                        border: '1px solid #d1d5db', borderRadius: 10, padding: 12,
                                        fontFamily: 'Consolas, monospace', fontSize: 12, lineHeight: 1.45,
                                        color: '#111827',
                                        background: '#ffffff',
                                    }}
                                />
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                    Editing is enabled. Save draft after making changes.
                                </span>
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                Draft HTML Content is hidden. Click <strong>Edit Draft</strong> to open the editor.
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                disabled={savingDraft}
                                style={{
                                    background: '#0f766e', color: '#fff', border: 'none', padding: '10px 16px',
                                    borderRadius: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13,
                                    opacity: savingDraft ? 0.7 : 1,
                                }}
                            >
                                {savingDraft ? 'Saving Draft...' : 'Save Draft'}
                            </button>

                            <button
                                type="button"
                                onClick={handlePublish}
                                disabled={publishing}
                                style={{
                                    background: '#1e3a8a', color: '#fff', border: 'none', padding: '10px 16px',
                                    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                                    opacity: publishing ? 0.7 : 1,
                                }}
                            >
                                {publishing ? 'Publishing...' : 'Publish'}
                            </button>
                        </div>

                        {publishedHtml && (
                            <div style={{ marginTop: 18, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
                                <h3 style={{ margin: 0, fontSize: 14, color: '#111827' }}>Last Published Snapshot</h3>
                                <div
                                    style={{
                                        marginTop: 8, maxHeight: 220, overflow: 'auto',
                                        border: '1px solid #e5e7eb', borderRadius: 8, padding: 10,
                                        background: '#ffffff', fontSize: 12,
                                    }}
                                >
                                    <div dangerouslySetInnerHTML={{ __html: publishedHtml }} />
                                </div>
                            </div>
                        )}
                    </div>
            </div>

            {isDraftPreviewOpen && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Draft preview document"
                    onClick={() => setIsDraftPreviewOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 1200,
                        background: 'rgba(15, 23, 42, 0.45)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 'min(980px, 96vw)',
                            maxHeight: '90vh',
                            background: '#ffffff',
                            borderRadius: 'var(--modal-radius)',
                            border: '1px solid #cbd5e1',
                            boxShadow: '0 30px 90px rgba(15, 23, 42, 0.35)',
                            overflow: 'hidden',
                            display: 'grid',
                            gridTemplateRows: 'auto 1fr',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: '1px solid #e2e8f0',
                                padding: '12px 14px',
                                background: '#f8fafc',
                            }}
                        >
                            <strong style={{ fontSize: 14, color: '#0f172a' }}>Draft Preview</strong>
                            <button
                                type="button"
                                onClick={() => setIsDraftPreviewOpen(false)}
                                style={{
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    padding: '6px 10px',
                                    background: '#ffffff',
                                    cursor: 'pointer',
                                    color: '#334155',
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}
                            >
                                Close
                            </button>
                        </div>

                        <div style={{ overflow: 'auto', background: '#e2e8f0', padding: 18 }}>
                            <div
                                style={{
                                    position: 'relative',
                                    overflow: 'hidden',
                                    maxWidth: 780,
                                    margin: '0 auto',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 8,
                                    padding: '28px 34px',
                                    minHeight: 520,
                                    boxShadow: '0 14px 30px rgba(15, 23, 42, 0.2)',
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
                                        {previewWatermarkPositions.map((topPosition, index) => (
                                            <div
                                                key={`preview-wm-${index}`}
                                                style={{
                                                    position: 'absolute',
                                                    top: topPosition,
                                                    left: '50%',
                                                    width: previewWatermarkWidth,
                                                    maxWidth: 460,
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
                                    <div style={{ marginBottom: 14, fontSize: 11, color: '#64748b', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                                        Draft Policy Document
                                    </div>
                                    <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </SettingsLayout>
    );
}
