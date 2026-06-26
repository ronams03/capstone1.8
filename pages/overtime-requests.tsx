import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Pagination from '@/components/Pagination';
import CrudActionIcon from '@/components/CrudActionIcon';
import { getApiBaseUrl } from '@/utils/network';
import { notifyError } from '@/utils/notify';

const API = getApiBaseUrl();
const ITEMS_PER_PAGE = 10;

type SessionUser = {
  role?: string;
  employee_id?: number;
  [key: string]: unknown;
};

type OvertimeRow = {
  overtime_request_id: number;
  employee_id: number;
  employee_name?: string;
  work_date: string;
  hours_requested: number;
  reason: string;
  status: 'submitted' | 'approved' | 'rejected' | 'cancelled' | string;
  sla_due_at?: string;
  manager_notes?: string;
  created_at: string;
  is_archived?: number | boolean;
  archived_at?: string | null;
};

type ApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export default function OvertimeRequestsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<OvertimeRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchiveView, setShowArchiveView] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [actingId, setActingId] = useState<number | null>(null);

  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [hoursRequested, setHoursRequested] = useState('2');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState<OvertimeRow | null>(null);

  const role = String(user?.role || '').toLowerCase();
  const canSubmit = ['staff', 'manager', 'admin'].includes(role);
  const canApprove = role === 'manager' || role === 'admin';

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch(`${API}/auth.php`, { credentials: 'include' });
        const sessionData = (await sessionRes.json()) as ApiResponse<SessionUser>;
        if (!sessionData.success || !sessionData.data) {
          router.push('/');
          return;
        }

        const userRole = String(sessionData.data.role || '').toLowerCase();
        if (!['staff', 'manager', 'admin'].includes(userRole)) {
          router.push('/dashboard');
          return;
        }

        setUser(sessionData.data);
        await fetchRows('all', false);
      } catch {
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (!error) return;
    void notifyError(error);
    setError('');
  }, [error]);

  useEffect(() => {
    if (!selectedRow) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedRow(null);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedRow]);

  const fetchRows = async (nextStatus: string, archivedOnly = showArchiveView) => {
    setRefreshing(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextStatus !== 'all') params.set('status', nextStatus);
      params.set('archived', archivedOnly ? '1' : '0');
      const res = await fetch(`${API}/overtime-requests.php?${params.toString()}`, { credentials: 'include' });
      const data = (await res.json()) as ApiResponse<OvertimeRow[]>;
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data);
      } else {
        setRows([]);
        setError(data.message || 'Failed to load overtime requests.');
      }
    } catch {
      setRows([]);
      setError('Failed to load overtime requests.');
    } finally {
      setRefreshing(false);
    }
  };

  const submitRequest = async () => {
    if (!canSubmit) return;
    if (!workDate || !hoursRequested || !reason.trim()) {
      setError('Work date, requested hours, and reason are required.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        work_date: workDate,
        hours_requested: Number(hoursRequested),
        reason: reason.trim(),
      };
      if (role !== 'staff' && user?.employee_id) {
        payload.employee_id = Number(user.employee_id);
      }

      const res = await fetch(`${API}/overtime-requests.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to submit overtime request.');
        return;
      }

      setReason('');
      setHoursRequested('2');
      await fetchRows(statusFilter, showArchiveView);
      if (role === 'admin') {
        setShowCreateModal(false);
      }
    } catch {
      setError('Failed to submit overtime request.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (row: OvertimeRow, nextStatus: 'approved' | 'rejected' | 'cancelled') => {
    setActingId(row.overtime_request_id);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        overtime_request_id: row.overtime_request_id,
      };
      if (nextStatus === 'cancelled') {
        payload.action = 'cancel';
      } else {
        payload.status = nextStatus;
        payload.manager_notes = nextStatus === 'approved'
          ? 'Approved from overtime request board.'
          : 'Rejected from overtime request board.';
      }

      const res = await fetch(`${API}/overtime-requests.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to update overtime request.');
        return;
      }
      if (selectedRow?.overtime_request_id === row.overtime_request_id) {
        setSelectedRow(null);
      }
      await fetchRows(statusFilter, showArchiveView);
    } catch {
      setError('Failed to update overtime request.');
    } finally {
      setActingId(null);
    }
  };

  const toggleArchiveView = () => {
    const nextArchiveView = !showArchiveView;
    setShowArchiveView(nextArchiveView);
    setStatusFilter('all');
    setCurrentPage(1);
    setSelectedRow(null);
    void fetchRows('all', nextArchiveView);
  };

  const paginatedRows = useMemo(() => {
    return rows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [rows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length, statusFilter, showArchiveView]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [rows.length, currentPage]);

  const handleLogout = async () => {
    await fetch(`${API}/auth.php?action=logout`, { method: 'POST', credentials: 'include' });
    router.push('/');
  };

  if (loading) {

    return (

      <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>

        <div style={{ padding: 20 }}>Loading...</div>

      </Layout>

    );

  }

  return (
    <Layout role={String(user?.role || '')} user={user} onLogout={handleLogout}>
      <Head>
        <title>Overtime Requests</title>
      </Head>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 12 }}>
        <div className="pageHeaderInline" style={{ marginBottom: 10 }}>
          <div className="pageHeaderText">
            <h1 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Overtime Requests</h1>
            <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
              Submit and track overtime requests.
            </p>
          </div>
          <div className="pageInlineFilters">
            <select
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value;
                setStatusFilter(value);
                void fetchRows(value, showArchiveView);
              }}
              style={inputStyle}
            >
              <option value="all">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={() => void fetchRows(statusFilter, showArchiveView)}
              style={{
                border: '1px solid #1e3a8a',
                background: '#1e3a8a',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 14px',
                cursor: 'pointer',
              }}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={toggleArchiveView}
              style={archiveStorageBtn(showArchiveView)}
              title={showArchiveView ? 'Back to active overtime requests' : 'Open overtime archive storage'}
              aria-label={showArchiveView ? 'Back to active overtime requests' : 'Open overtime archive storage'}
            >
              <CrudActionIcon action="archive" size={15} />
              {showArchiveView ? 'Back to Active' : 'Archive Storage'}
            </button>
            {canSubmit && role === 'admin' && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              style={headerAddBtn}
            >
              <CrudActionIcon action="create" size={15} />
              Add Overtime Request
            </button>
            )}
          </div>
        </div>

        {canSubmit && role !== 'admin' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={labelStyle}>Work Date</label>
                <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Hours Requested</label>
                <input type="number" min={0.5} max={24} step={0.5} value={hoursRequested} onChange={(e) => setHoursRequested(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Reason</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe why overtime is needed..."
                  style={inputStyle}
                />
              </div>
              <button
                onClick={() => void submitRequest()}
                disabled={submitting}
                style={{
                  border: '1px solid #1e3a8a',
                  background: '#1e3a8a',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.75 : 1,
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        )}

        {canSubmit && role === 'admin' && showCreateModal && (
          <div style={modalBackdrop} onClick={() => setShowCreateModal(false)}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderRow}>
                <h2 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Add Overtime Request</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={modalCloseBtn}
                  aria-label="Close add overtime request modal"
                >
                  x
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Work Date</label>
                  <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Hours Requested</label>
                  <input type="number" min={0.5} max={24} step={0.5} value={hoursRequested} onChange={(e) => setHoursRequested(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div>
                  <label style={labelStyle}>Reason</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe why overtime is needed..."
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={modalSecondaryBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitRequest()}
                    disabled={submitting}
                    style={{
                      border: '1px solid #1e3a8a',
                      background: '#1e3a8a',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontWeight: 700,
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      opacity: submitting ? 0.75 : 1,
                    }}
                  >
                    {submitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Work Date</th>
                <th style={thStyle}>Hours</th>
                <th style={thStyle}>Reason</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>SLA Due</th>
                <th style={thStyle}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    {showArchiveView ? 'No archived overtime requests found.' : 'No overtime requests found.'}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((row) => {
                  const canCancelRow = row.status === 'submitted'
                    && (canApprove || Number(row.employee_id) === Number(user?.employee_id));
                  return (
                  <tr key={row.overtime_request_id} style={{ borderTop: '1px solid #eef2f7' }}>
                      <td style={tdStyle}>{row.employee_name || `Employee #${row.employee_id}`}</td>
                      <td style={tdStyle}>{row.work_date}</td>
                      <td style={tdStyle}>{formatHours(row.hours_requested)}</td>
                      <td style={tdStyle}>
                        <div style={{ maxWidth: 300, color: '#334155' }}>{truncateText(row.reason, 96)}</div>
                        {row.manager_notes && <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>Note: {truncateText(row.manager_notes, 72)}</div>}
                      </td>
                      <td style={tdStyle}>
                        <span style={statusPill(row.status)}>{row.status}</span>
                      </td>
                      <td style={tdStyle}>{formatDateTime(row.sla_due_at)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            title="Read overtime request"
                            aria-label="Read overtime request"
                            style={textActionBtn}
                          >
                            View
                          </button>
                          {canApprove && row.status === 'submitted' && (
                            <>
                              <button
                                onClick={() => void updateStatus(row, 'approved')}
                                disabled={actingId === row.overtime_request_id}
                                style={{ ...textActionBtn, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => void updateStatus(row, 'rejected')}
                                disabled={actingId === row.overtime_request_id}
                                style={{ ...textActionBtn, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canCancelRow && (
                            <button
                              onClick={() => void updateStatus(row, 'cancelled')}
                              disabled={actingId === row.overtime_request_id}
                              title="Cancel overtime request"
                              aria-label="Cancel overtime request"
                              style={{ ...textActionBtn, background: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                  </tr>
                )})
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={rows.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          label={showArchiveView ? 'archived overtime requests' : 'overtime requests'}
        />
      </div>

      {selectedRow && (
        <div style={modalBackdrop} onClick={() => setSelectedRow(null)}>
          <div style={viewModalCard} onClick={(event) => event.stopPropagation()}>
            <div style={viewModalHeader}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={viewModalEyebrow}>Overtime Request Details</div>
                <div>
                  <h2 style={viewModalTitle}>
                    Request #{selectedRow.overtime_request_id}
                  </h2>
                  <p style={viewModalSubtitle}>
                    Review the full overtime request record.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={statusPill(selectedRow.status)}>{selectedRow.status}</span>
                  <span style={viewMetaChip}>{selectedRow.employee_name || `Employee #${selectedRow.employee_id}`}</span>
                  <span style={viewMetaChip}>{selectedRow.work_date}</span>
                  <span style={viewMetaChip}>{formatHours(selectedRow.hours_requested)} hours</span>
                  {Number(selectedRow.is_archived ?? 0) === 1 && <span style={viewMetaChip}>Archive Storage</span>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                style={modalCloseBtn}
                aria-label="Close overtime request details"
              >
                x
              </button>
            </div>

            <div style={viewModalBody}>
              <div style={detailGridStyle}>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>Employee</div>
                  <div style={detailValueStyle}>{selectedRow.employee_name || `Employee #${selectedRow.employee_id}`}</div>
                </div>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>Work Date</div>
                  <div style={detailValueStyle}>{selectedRow.work_date}</div>
                </div>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>Hours Requested</div>
                  <div style={detailValueStyle}>{formatHours(selectedRow.hours_requested)}</div>
                </div>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>Submitted At</div>
                  <div style={detailValueStyle}>{formatDateTime(selectedRow.created_at)}</div>
                </div>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>SLA Due</div>
                  <div style={detailValueStyle}>{formatDateTime(selectedRow.sla_due_at)}</div>
                </div>
                <div style={detailCardStyle}>
                  <div style={detailLabelStyle}>Current Status</div>
                  <div style={detailValueStyle}>
                    <span style={statusPill(selectedRow.status)}>{selectedRow.status}</span>
                  </div>
                </div>
                {Number(selectedRow.is_archived ?? 0) === 1 && (
                  <div style={detailCardStyle}>
                    <div style={detailLabelStyle}>Archived At</div>
                    <div style={detailValueStyle}>{formatDateTime(selectedRow.archived_at)}</div>
                  </div>
                )}
              </div>

              <div style={detailSectionStyle}>
                <div style={detailLabelStyle}>Reason</div>
                <div style={detailTextStyle}>{selectedRow.reason || 'No reason provided.'}</div>
              </div>

              <div style={detailSectionStyle}>
                <div style={detailLabelStyle}>Manager Notes</div>
                <div style={detailTextStyle}>{selectedRow.manager_notes || 'No manager notes yet.'}</div>
              </div>
            </div>

            <div style={viewModalFooter}>
              <button
                type="button"
                onClick={() => setSelectedRow(null)}
                style={modalSecondaryBtn}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  color: '#475569',
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1f2937',
};

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  color: '#475569',
  fontSize: 13,
  fontWeight: 700,
};

const tdStyle: CSSProperties = {
  padding: '12px 14px',
  color: '#334155',
  fontSize: 13,
  verticalAlign: 'top',
};

function iconActionButton(background: string): CSSProperties {
  return {
    background,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    width: 32,
    height: 32,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  };
}

const iconActionBtn: CSSProperties = {
  background: 'transparent',
  color: '#64748b',
  border: 'none',
  borderRadius: 4,
  width: 24,
  height: 24,
  minWidth: 24,
  minHeight: 24,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
};

const textActionBtn: CSSProperties = {
  background: '#eff6ff',
  color: '#1d4ed8',
  border: '1px solid #bfdbfe',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s ease',
};

function formatHours(value: number | string | null | undefined) {
  return Number(value || 0).toFixed(2);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusPill(status: string): CSSProperties {
  if (status === 'approved') return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'rejected') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'cancelled') return { background: '#e2e8f0', color: '#334155', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function archiveStorageBtn(active: boolean): CSSProperties {
  return {
    border: '1px solid #1e3a8a',
    background: active ? '#1e3a8a' : '#eff6ff',
    color: active ? '#fff' : '#1e3a8a',
    borderRadius: 10,
    padding: '10px 14px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };
}

function truncateText(value: string, max: number) {
  const text = String(value || '').trim();
  if (text.length <= max) return text || '-';
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

const headerAddBtn: CSSProperties = {
  border: '1px solid #1e3a8a',
  background: '#1e3a8a',
  color: '#fff',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  alignSelf: 'flex-start',
};

const modalBackdrop: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 14,
  background: 'rgba(15, 23, 42, 0.45)',
};

const modalCard: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  borderRadius: 'var(--modal-radius)',
  border: '1px solid #cbd5e1',
  background: '#fff',
  boxShadow: '0 18px 45px rgba(2, 6, 23, 0.28)',
  padding: 14,
};

const modalHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const modalCloseBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#334155',
  borderRadius: 8,
  width: 30,
  height: 30,
  cursor: 'pointer',
  fontWeight: 700,
};

const modalSecondaryBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  borderRadius: 10,
  padding: '10px 12px',
  fontWeight: 600,
  cursor: 'pointer',
};

const viewModalCard: CSSProperties = {
  width: 'min(1080px, calc(100vw - 28px))',
  maxHeight: 'calc(100vh - 28px)',
  borderRadius: 'var(--modal-radius)',
  border: '1px solid #cbd5e1',
  background: '#fff',
  boxShadow: '0 18px 45px rgba(2, 6, 23, 0.28)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const viewModalHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  padding: '18px 18px 0 18px',
};

const viewModalEyebrow: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 800,
};

const viewModalTitle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#0f172a',
  letterSpacing: '-0.03em',
};

const viewModalSubtitle: CSSProperties = {
  margin: '6px 0 0 0',
  color: '#64748b',
  fontSize: 13,
};

const viewMetaChip: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  background: '#eff6ff',
  color: '#1e3a8a',
  fontSize: 12,
  fontWeight: 700,
};

const viewModalBody: CSSProperties = {
  padding: 18,
  overflowY: 'auto',
  display: 'grid',
  gap: 14,
};

const detailGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 12,
};

const detailCardStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  background: '#f8fafc',
  padding: '12px 14px',
};

const detailSectionStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  background: '#fff',
  padding: '14px 16px',
};

const detailLabelStyle: CSSProperties = {
  fontSize: 11,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 800,
  marginBottom: 6,
};

const detailValueStyle: CSSProperties = {
  color: '#0f172a',
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.5,
};

const detailTextStyle: CSSProperties = {
  color: '#334155',
  fontSize: 14,
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
};

const viewModalFooter: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  padding: '0 18px 18px 18px',
};
