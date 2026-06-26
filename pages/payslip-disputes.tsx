import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Pagination from '@/components/Pagination';
import CrudActionIcon from '@/components/CrudActionIcon';
import { getApiBaseUrl } from '@/utils/network';
import { confirmAction, notifyError } from '@/utils/notify';

const API = getApiBaseUrl();
const ITEMS_PER_PAGE = 8;

type SessionUser = {
  role?: string;
  employee_id?: number;
  [key: string]: unknown;
};

type PayrollRow = {
  id: number;
  pay_period_start: string;
  pay_period_end: string;
  net_pay: number;
};

type DisputeRow = {
  dispute_id: number;
  payroll_id: number;
  employee_id: number;
  employee_name?: string;
  issue_type: 'missing_overtime' | 'deduction_error' | 'allowance_missing' | 'wrong_period' | 'other' | string;
  dispute_reason: string;
  expected_value?: number | null;
  current_value?: number | null;
  status: 'submitted' | 'in_review' | 'resolved' | 'rejected' | 'closed' | 'cancelled' | string;
  priority: 'low' | 'medium' | 'high' | string;
  sla_due_at?: string | null;
  resolution_notes?: string | null;
  pay_period_start?: string;
  pay_period_end?: string;
  created_at: string;
  resolved_at?: string | null;
  is_archived?: number | boolean;
  archived_at?: string | null;
};

type CommentRow = {
  comment_id: number;
  dispute_id: number;
  user_id: number;
  comment_text: string;
  created_at: string;
  commenter_name: string;
  commenter_role: string;
};

type ApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

const issueTypeOptions = [
  { value: 'missing_overtime', label: 'Missing Overtime' },
  { value: 'deduction_error', label: 'Deduction Error' },
  { value: 'allowance_missing', label: 'Allowance Missing' },
  { value: 'wrong_period', label: 'Wrong Period' },
  { value: 'other', label: 'Other' },
] as const;

export default function PayslipDisputesPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [rowsArchiveView, setRowsArchiveView] = useState(false);
  const [payrollRows, setPayrollRows] = useState<PayrollRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchiveView, setShowArchiveView] = useState(false);

  const [formPayrollId, setFormPayrollId] = useState('');
  const [formIssueType, setFormIssueType] = useState<'missing_overtime' | 'deduction_error' | 'allowance_missing' | 'wrong_period' | 'other'>('missing_overtime');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formExpectedValue, setFormExpectedValue] = useState('');
  const [formCurrentValue, setFormCurrentValue] = useState('');
  const [formReason, setFormReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const disputeListRequestRef = useRef(0);

  const role = String(user?.role || '').toLowerCase();
  const canSubmit = ['staff', 'manager', 'admin'].includes(role);
  const canManage = role === 'manager' || role === 'admin';
  const visibleRows = useMemo(
    () => (rowsArchiveView === showArchiveView ? rows : []),
    [rows, rowsArchiveView, showArchiveView]
  );
  const isSwitchingDisputeScope = refreshing && rowsArchiveView !== showArchiveView;

  const selected = useMemo(
    () => rows.find((row) => row.dispute_id === selectedId) || null,
    [rows, selectedId]
  );

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
        await Promise.all([fetchDisputes('all'), fetchPayrollRows(sessionData.data)]);
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
    if (!router.isReady) return;
    const queryDisputeId = Number(router.query.dispute_id || 0);
    if (queryDisputeId > 0) {
      setSelectedId(queryDisputeId);
    }
    const queryPayrollId = Number(router.query.payroll_id || 0);
    if (queryPayrollId > 0 && !formPayrollId) {
      setFormPayrollId(String(queryPayrollId));
      setShowSubmitModal(true);
    }
  }, [router.isReady, router.query.dispute_id, router.query.payroll_id, formPayrollId]);

  useEffect(() => {
    if (!selected?.dispute_id) {
      setComments([]);
      return;
    }

    void fetchComments(selected.dispute_id);
  }, [selected?.dispute_id]);

  useEffect(() => {
    if (!error) return;
    void notifyError(error);
    setError('');
  }, [error]);

  const fetchDisputes = async (nextStatus: string, archivedOnly = showArchiveView) => {
    const requestId = disputeListRequestRef.current + 1;
    disputeListRequestRef.current = requestId;
    setRefreshing(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (nextStatus !== 'all') params.set('status', nextStatus);
      params.set('archived', archivedOnly ? '1' : '0');
      const res = await fetch(`${API}/payslip-disputes.php?${params.toString()}`, { credentials: 'include' });
      const data = (await res.json()) as ApiResponse<DisputeRow[]>;
      if (requestId !== disputeListRequestRef.current) return;
      if (data.success && Array.isArray(data.data)) {
        setRows(data.data);
        setRowsArchiveView(archivedOnly);
      } else {
        setRows([]);
        setRowsArchiveView(archivedOnly);
        setError(data.message || 'Failed to load disputes.');
      }
    } catch {
      if (requestId !== disputeListRequestRef.current) return;
      setRows([]);
      setRowsArchiveView(archivedOnly);
      setError('Failed to load disputes.');
    } finally {
      if (requestId === disputeListRequestRef.current) {
        setRefreshing(false);
      }
    }
  };

  const closeDetailModal = () => {
    setSelectedId(null);
    setCommentText('');
  };

  const openDetailModal = (disputeId: number) => {
    setSelectedId(disputeId);
    setCommentText('');
  };

  const toggleArchiveView = () => {
    const nextArchiveView = !showArchiveView;
    closeDetailModal();
    setShowArchiveView(nextArchiveView);
    setStatusFilter('all');
    setCurrentPage(1);
    void fetchDisputes('all', nextArchiveView);
  };

  const fetchPayrollRows = async (sessionUser: SessionUser) => {
    const params = new URLSearchParams();
    if (sessionUser.employee_id) {
      params.set('employee_id', String(sessionUser.employee_id));
      params.set('released_only', '1');
      params.set('include_archived', '1');
    }
    const res = await fetch(`${API}/payroll.php?${params.toString()}`, { credentials: 'include' });
    const data = (await res.json()) as ApiResponse<PayrollRow[]>;
    if (data.success && Array.isArray(data.data)) {
      setPayrollRows(data.data);
      if (!formPayrollId && data.data.length > 0) {
        setFormPayrollId(String(data.data[0].id));
      }
    }
  };

  const fetchComments = async (disputeId: number) => {
    try {
      const params = new URLSearchParams({ comments: '1', dispute_id: String(disputeId) });
      const res = await fetch(`${API}/payslip-disputes.php?${params.toString()}`, { credentials: 'include' });
      const data = (await res.json()) as ApiResponse<CommentRow[]>;
      if (data.success && Array.isArray(data.data)) {
        setComments(data.data);
      } else {
        setComments([]);
      }
    } catch {
      setComments([]);
    }
  };

  const submitDispute = async () => {
    if (!canSubmit) return;
    if (!formPayrollId || !formReason.trim()) {
      setError('Payroll record and dispute reason are required.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        payroll_id: Number(formPayrollId),
        issue_type: formIssueType,
        priority: formPriority,
        expected_value: formExpectedValue ? Number(formExpectedValue) : null,
        current_value: formCurrentValue ? Number(formCurrentValue) : null,
        dispute_reason: formReason.trim(),
      };

      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse<{ dispute_id: number }>;
      if (!data.success) {
        setError(data.message || 'Failed to submit dispute.');
        return;
      }

      setFormReason('');
      setFormCurrentValue('');
      setFormExpectedValue('');
      if (data.data?.dispute_id) {
        const newDispute: DisputeRow = {
          dispute_id: data.data.dispute_id,
          payroll_id: Number(formPayrollId),
          employee_id: Number(user?.employee_id || 0),
          issue_type: formIssueType,
          dispute_reason: formReason.trim(),
          expected_value: formExpectedValue ? Number(formExpectedValue) : null,
          current_value: formCurrentValue ? Number(formCurrentValue) : null,
          status: 'submitted',
          priority: formPriority,
          sla_due_at: null,
          resolution_notes: null,
          created_at: new Date().toISOString(),
          resolved_at: null,
          is_archived: 0,
          archived_at: null,
        };
        setRows(prev => [newDispute, ...prev]);
        setSelectedId(data.data.dispute_id);
      } else {
        await fetchDisputes(statusFilter);
      }
      setShowSubmitModal(false);
    } catch {
      setError('Failed to submit dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  const addComment = async () => {
    if (!selected?.dispute_id) return;
    if (!commentText.trim()) {
      setError('Comment is required.');
      return;
    }
    setCommenting(true);
    setError('');
    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'comment',
          dispute_id: selected.dispute_id,
          comment: commentText.trim(),
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to add comment.');
        return;
      }
      setCommentText('');
      await fetchComments(selected.dispute_id);
    } catch {
      setError('Failed to add comment.');
    } finally {
      setCommenting(false);
    }
  };

  const archiveDispute = async (row: DisputeRow) => {
    const ok = await confirmAction({
      title: 'Archive dispute?',
      text: `Move dispute #${row.dispute_id} to archive storage?`,
      confirmButtonText: 'Archive',
      icon: 'warning',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dispute_id: row.dispute_id,
          action: 'archive',
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to archive dispute.');
        return;
      }
      if (selectedId === row.dispute_id) closeDetailModal();
      setRows(prev => prev.filter(d => d.dispute_id !== row.dispute_id));
    } catch {
      setError('Failed to archive dispute.');
    }
  };

  const restoreDispute = async (row: DisputeRow) => {
    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dispute_id: row.dispute_id,
          action: 'restore',
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to restore dispute.');
        return;
      }
      if (selectedId === row.dispute_id) closeDetailModal();
      setRows(prev => prev.filter(d => d.dispute_id !== row.dispute_id));
    } catch {
      setError('Failed to restore dispute.');
    }
  };

  const cancelDispute = async (row: DisputeRow, options?: { closeAfter?: boolean }) => {
    const ok = await confirmAction({
      title: 'Cancel dispute?',
      text: `Cancel dispute #${row.dispute_id}?`,
      confirmButtonText: 'Cancel Dispute',
      icon: 'warning',
      danger: true,
    });
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dispute_id: row.dispute_id,
          action: 'cancel',
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to cancel dispute.');
        return;
      }

      setRows(prev => prev.map(d => d.dispute_id === row.dispute_id ? { ...d, status: 'cancelled' } : d));
      if (options?.closeAfter || selectedId === row.dispute_id) {
        closeDetailModal();
      }
    } catch {
      setError('Failed to cancel dispute.');
    } finally {
      setSaving(false);
    }
  };

  const updateDispute = async (
    payload: Record<string, unknown>,
    options?: { closeAfter?: boolean }
  ) => {
    if (!selected?.dispute_id) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          dispute_id: selected.dispute_id,
          ...payload,
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to update dispute.');
        return;
      }
      const newStatus = payload.action === 'close' ? 'closed' : (payload.status as string || selected.status);
      setRows(prev => prev.map(d => d.dispute_id === selected.dispute_id ? { ...d, status: newStatus } : d));
      if (options?.closeAfter) {
        closeDetailModal();
      }
    } catch {
      setError('Failed to update dispute.');
    } finally {
      setSaving(false);
    }
  };

  const paginatedRows = useMemo(() => {
    return visibleRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [visibleRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [visibleRows.length, statusFilter, showArchiveView]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(visibleRows.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [visibleRows.length, currentPage]);

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
        <title>Payslip Disputes</title>
      </Head>

      <div style={{ maxWidth: 1260, margin: '0 auto', padding: 12 }}>
        <div className="pageHeaderInline" style={{ marginBottom: 10 }}>
          <div className="pageHeaderText">
          <h1 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Payslip Disputes</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
            Submit and track payslip disputes.
          </p>
          </div>
          <div className="pageInlineFilters">
            <select
              value={statusFilter}
              onChange={(e) => {
                const value = e.target.value;
                setStatusFilter(value);
                void fetchDisputes(value);
              }}
              style={inputStyle}
            >
              <option value="all">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="in_review">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button
              onClick={() => void fetchDisputes(statusFilter)}
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
          {canSubmit && (
            <>
            <button
              type="button"
              onClick={toggleArchiveView}
              style={archiveStorageBtn(showArchiveView)}
              title={showArchiveView ? 'Back to active disputes' : 'Open dispute archive storage'}
              aria-label={showArchiveView ? 'Back to active disputes' : 'Open dispute archive storage'}
            >
              <CrudActionIcon action="archive" size={15} />
              {showArchiveView ? 'Back to Active' : 'Archive Storage'}
            </button>
            <button
              onClick={() => setShowSubmitModal(true)}
              style={openModalBtn}
            >
              <CrudActionIcon action="create" size={15} />
              New Dispute
            </button>
            </>
          )}
          </div>
        </div>

        <div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Dispute</th>
                  <th style={thStyle}>Issue</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>SLA</th>
                  <th style={{ ...thStyle, textAlign: 'center', width: showArchiveView ? 210 : 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isSwitchingDisputeScope ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      {showArchiveView ? 'Loading archived disputes...' : 'Loading disputes...'}
                    </td>
                  </tr>
                ) : visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      {showArchiveView ? 'No archived disputes found.' : 'No disputes found.'}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr
                      key={row.dispute_id}
                      onClick={() => openDetailModal(row.dispute_id)}
                      style={{
                        borderTop: '1px solid #eef2f7',
                        cursor: 'pointer',
                        background: selectedId === row.dispute_id ? '#f8fbff' : 'transparent',
                      }}
                    >
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>#{row.dispute_id}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          {row.employee_name || `Employee #${row.employee_id}`}
                        </div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>
                          Payroll #{row.payroll_id}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={issueTypeBadge(row.issue_type)}>{formatIssueType(row.issue_type)}</span>
                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>{truncate(row.dispute_reason, 100)}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={statusBadge(row.status)}>{row.status}</span>
                        <div style={{ marginTop: 8 }}>
                          <span style={priorityBadge(row.priority)}>{row.priority}</span>
                        </div>
                      </td>
                      <td style={tdStyle}>{row.sla_due_at ? new Date(row.sla_due_at).toLocaleString() : '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDetailModal(row.dispute_id);
                            }}
                            title="Read dispute"
                            aria-label="Read dispute"
                            style={listActionButton('#1e3a8a')}
                          >
                            <CrudActionIcon action="view" size={14} />
                            <span>Read</span>
                          </button>
                          {!showArchiveView ? (
                            <>
                              {canCancelDispute(row, role, Number(user?.employee_id || 0)) && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void cancelDispute(row);
                                  }}
                                  title="Cancel dispute"
                                  aria-label="Cancel dispute"
                                  style={listActionButton('#475569')}
                                >
                                  <CrudActionIcon action="cancel" size={14} />
                                  <span>Cancel</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void archiveDispute(row);
                                }}
                                disabled={!canArchiveDispute(row)}
                                title={canArchiveDispute(row) ? 'Archive dispute' : 'Only resolved, rejected, closed, or cancelled disputes can be archived'}
                                aria-label="Archive dispute"
                                style={listActionButton('#64748b', !canArchiveDispute(row))}
                              >
                                <CrudActionIcon action="archive" size={14} />
                                <span>Archive</span>
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void restoreDispute(row);
                                }}
                                title="Restore dispute"
                                aria-label="Restore dispute"
                                style={listActionButton('#166534')}
                              >
                                <CrudActionIcon action="restore" size={14} />
                                <span>Restore</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={visibleRows.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
            label={showArchiveView ? 'archived disputes' : 'disputes'}
          />
        </div>

        {canSubmit && showSubmitModal && (
          <div
            style={modalOverlayStyle}
            onClick={() => {
              if (!submitting) setShowSubmitModal(false);
            }}
          >
            <div
              style={modalCardStyle}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={modalHeaderStyle}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Submit New Dispute</h3>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 12 }}>
                    Fill in the dispute details.
                  </p>
                </div>
                <button
                  onClick={() => !submitting && setShowSubmitModal(false)}
                  style={modalCloseBtn}
                  disabled={submitting}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
                <div>
                  <label style={labelStyle}>Payslip</label>
                  <select value={formPayrollId} onChange={(e) => setFormPayrollId(e.target.value)} style={inputStyle}>
                    <option value="">Select payslip</option>
                    {payrollRows.map((payroll) => (
                      <option key={payroll.id} value={payroll.id}>
                        #{payroll.id} | {payroll.pay_period_start} - {payroll.pay_period_end}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Issue Type</label>
                  <select value={formIssueType} onChange={(e) => setFormIssueType(e.target.value as 'missing_overtime' | 'deduction_error' | 'allowance_missing' | 'wrong_period' | 'other')} style={inputStyle}>
                    {issueTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Priority</label>
                  <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as 'low' | 'medium' | 'high')} style={inputStyle}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Expected Value (optional)</label>
                  <input type="number" value={formExpectedValue} onChange={(e) => setFormExpectedValue(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Current Value (optional)</label>
                  <input type="number" value={formCurrentValue} onChange={(e) => setFormCurrentValue(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Reason</label>
                  <textarea value={formReason} onChange={(e) => setFormReason(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => setShowSubmitModal(false)}
                  disabled={submitting}
                  style={modalCloseBtn}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void submitDispute()}
                  disabled={submitting}
                  style={{
                    border: '1px solid #1e3a8a',
                    background: '#1e3a8a',
                    color: '#fff',
                    borderRadius: 10,
                    padding: '10px 14px',
                    fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.75 : 1,
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selected && (
          <div
            style={detailModalOverlayStyle}
            onClick={() => {
              if (!saving && !commenting) closeDetailModal();
            }}
          >
            <div
              style={detailModalCardStyle}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={detailModalHeaderStyle}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>Dispute #{selected.dispute_id}</h3>
                  <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 12 }}>
                    Payroll #{selected.payroll_id} | {selected.pay_period_start || '-'} - {selected.pay_period_end || '-'}
                  </p>
                </div>
                <button
                  onClick={closeDetailModal}
                  disabled={saving || commenting}
                  style={modalCloseBtn}
                >
                  Close
                </button>
              </div>

              <div style={detailBadgeRowStyle}>
                <span style={statusBadge(selected.status)}>{selected.status}</span>
                <span style={issueTypeBadge(selected.issue_type)}>{formatIssueType(selected.issue_type)}</span>
                <span style={priorityBadge(selected.priority)}>{selected.priority}</span>
                {Number(selected.is_archived ?? 0) === 1 && <span style={archivedBadgeStyle}>Archived</span>}
                {saving && <span style={detailSavingTextStyle}>Updating dispute...</span>}
              </div>

              {canManage && Number(selected.is_archived ?? 0) !== 1 && (
                <div style={detailActionRowStyle}>
                  <button onClick={() => void updateDispute({ status: 'in_review' })} disabled={saving} style={neutralBtn}>Mark In Review</button>
                  <button
                    onClick={() => void updateDispute(
                      { status: 'resolved', resolution_notes: 'Resolved by reviewer.' },
                      { closeAfter: true }
                    )}
                    disabled={saving}
                    style={approveBtn}
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => void updateDispute(
                      { status: 'rejected', resolution_notes: 'Rejected by reviewer.' },
                      { closeAfter: true }
                    )}
                    disabled={saving}
                    style={rejectBtn}
                  >
                    Reject
                  </button>
                  {canCancelDispute(selected, role, Number(user?.employee_id || 0)) && (
                    <button
                      onClick={() => void cancelDispute(selected, { closeAfter: true })}
                      disabled={saving}
                      style={neutralBtn}
                    >
                      Cancel Dispute
                    </button>
                  )}
                </div>
              )}

              {role === 'staff' && canCancelDispute(selected, role, Number(user?.employee_id || 0)) && Number(selected.is_archived ?? 0) !== 1 && (
                <div style={detailActionRowStyle}>
                  <button
                    onClick={() => void cancelDispute(selected, { closeAfter: true })}
                    disabled={saving}
                    style={neutralBtn}
                  >
                    Cancel Dispute
                  </button>
                </div>
              )}

              {role === 'staff' && Number(selected.is_archived ?? 0) !== 1 && ['resolved', 'rejected'].includes(selected.status) && (
                <div style={detailActionRowStyle}>
                  <button
                    onClick={() => void updateDispute({ action: 'close' }, { closeAfter: true })}
                    disabled={saving}
                    style={neutralBtn}
                  >
                    Close Dispute
                  </button>
                </div>
              )}

              <div style={detailModalBodyStyle}>
                <div style={detailSectionCardStyle}>
                  <h4 style={detailSectionTitleStyle}>Summary</h4>
                  <div style={detailSummaryGridStyle}>
                    <div style={detailInfoTileStyle}>
                      <span style={detailInfoLabelStyle}>Employee</span>
                      <strong>{selected.employee_name || `Employee #${selected.employee_id}`}</strong>
                    </div>
                    <div style={detailInfoTileStyle}>
                      <span style={detailInfoLabelStyle}>Issued At</span>
                      <strong>{new Date(selected.created_at).toLocaleString()}</strong>
                    </div>
                    <div style={detailInfoTileStyle}>
                      <span style={detailInfoLabelStyle}>SLA Due</span>
                      <strong>{selected.sla_due_at ? new Date(selected.sla_due_at).toLocaleString() : '-'}</strong>
                    </div>
                    <div style={detailInfoTileStyle}>
                      <span style={detailInfoLabelStyle}>Resolved At</span>
                      <strong>{selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : '-'}</strong>
                    </div>
                    <div style={detailInfoTileStyle}>
                      <span style={detailInfoLabelStyle}>Archived At</span>
                      <strong>{selected.archived_at ? new Date(selected.archived_at).toLocaleString() : '-'}</strong>
                    </div>
                    {selected.expected_value !== null && selected.expected_value !== undefined && (
                      <div style={detailInfoTileStyle}>
                        <span style={detailInfoLabelStyle}>Expected Value</span>
                        <strong>{selected.expected_value}</strong>
                      </div>
                    )}
                    {selected.current_value !== null && selected.current_value !== undefined && (
                      <div style={detailInfoTileStyle}>
                        <span style={detailInfoLabelStyle}>Current Value</span>
                        <strong>{selected.current_value}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ ...detailRow, marginTop: 14 }}>
                    <strong>Reason:</strong>
                    <div style={{ marginTop: 6, color: '#334155' }}>{selected.dispute_reason}</div>
                  </div>

                  <div style={{ ...detailRow, marginTop: 14 }}>
                    <strong>Resolution Notes:</strong>
                    <div style={{ marginTop: 6, color: '#334155' }}>{selected.resolution_notes || 'No resolution notes yet.'}</div>
                  </div>
                </div>

                <div style={detailSectionCardStyle}>
                  <h4 style={detailSectionTitleStyle}>Discussion</h4>
                  <div style={detailCommentsListStyle}>
                    {comments.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: 12 }}>No comments yet.</div>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.comment_id} style={detailCommentCardStyle}>
                          <div style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>
                            {comment.commenter_name} ({comment.commenter_role || 'user'})
                          </div>
                          <div style={{ fontSize: 13, color: '#1f2937', marginTop: 2 }}>{comment.comment_text}</div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{new Date(comment.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>

                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    rows={4}
                    placeholder="Add comment..."
                    style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 8 }}
                  />
                  <button
                    onClick={() => void addComment()}
                    disabled={commenting}
                    style={detailCommentButtonStyle}
                  >
                    {commenting ? 'Posting...' : 'Post Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function truncate(value: string, max: number) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function formatIssueType(value: string) {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function canArchiveDispute(row: DisputeRow) {
  const normalizedStatus = String(row.status || '').toLowerCase();
  return ['resolved', 'rejected', 'closed', 'cancelled'].includes(normalizedStatus);
}

function canCancelDispute(row: DisputeRow, role: string, selfEmployeeId: number) {
  const normalizedStatus = String(row.status || '').toLowerCase();
  if (Number(row.is_archived ?? 0) === 1) return false;
  if (!['submitted', 'in_review'].includes(normalizedStatus)) return false;

  const normalizedRole = String(role || '').toLowerCase();
  if (normalizedRole === 'staff') {
    return selfEmployeeId > 0 && Number(row.employee_id) === selfEmployeeId;
  }

  return normalizedRole === 'admin' || normalizedRole === 'manager';
}

function canDeleteArchivedDispute(role: string) {
  const normalizedRole = String(role || '').toLowerCase();
  return normalizedRole === 'admin' || normalizedRole === 'manager';
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 12,
  color: '#475569',
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: '100%',
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

const detailRow: CSSProperties = {
  fontSize: 13,
  color: '#334155',
  lineHeight: 1.45,
};

function statusBadge(status: string): CSSProperties {
  if (status === 'resolved') return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'rejected') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'closed') return { background: '#e2e8f0', color: '#334155', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'cancelled') return { background: '#e2e8f0', color: '#475569', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'in_review') return { background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function priorityBadge(priority: string): CSSProperties {
  if (priority === 'high') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 };
  if (priority === 'low') return { background: '#e2e8f0', color: '#334155', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 };
  return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700 };
}

function issueTypeBadge(issueType: string): CSSProperties {
  if (issueType === 'missing_overtime') return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (issueType === 'deduction_error') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (issueType === 'allowance_missing') return { background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

const approveBtn: CSSProperties = {
  border: '1px solid #16a34a',
  background: '#16a34a',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const rejectBtn: CSSProperties = {
  border: '1px solid #dc2626',
  background: '#dc2626',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const neutralBtn: CSSProperties = {
  border: '1px solid #475569',
  background: '#475569',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 12,
};

const openModalBtn: CSSProperties = {
  border: '1px solid #1e3a8a',
  background: '#1e3a8a',
  color: '#fff',
  borderRadius: 10,
  padding: '10px 14px',
  fontWeight: 700,
  cursor: 'pointer',
};

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

function iconActionButton(background: string, disabled = false): CSSProperties {
  return {
    background,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    width: 32,
    height: 32,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    opacity: disabled ? 0.45 : 1,
  };
}

function listActionButton(background: string, disabled = false): CSSProperties {
  return {
    background,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    minHeight: 32,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 10px',
    opacity: disabled ? 0.45 : 1,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 12000,
  padding: 18,
};

const modalCardStyle: CSSProperties = {
  width: 'min(980px, 96vw)',
  background: '#fff',
  borderRadius: 'var(--modal-radius)',
  border: '1px solid #e2e8f0',
  boxShadow: '0 20px 40px rgba(15, 23, 42, 0.22)',
  padding: 14,
};

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
};

const modalCloseBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  borderRadius: 8,
  padding: '8px 10px',
  fontWeight: 600,
  cursor: 'pointer',
};

const detailModalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.58)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 11950,
  padding: 18,
};

const detailModalCardStyle: CSSProperties = {
  width: 'min(1120px, 96vw)',
  maxHeight: '90vh',
  overflow: 'auto',
  background: '#fff',
  borderRadius: 'var(--modal-radius)',
  border: '1px solid #dbe4f0',
  boxShadow: '0 24px 55px rgba(15, 23, 42, 0.26)',
  padding: 16,
};

const detailModalHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 12,
};

const detailBadgeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  marginBottom: 12,
};

const detailActionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginBottom: 12,
};

const detailSavingTextStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 12,
  fontWeight: 700,
};

const archivedBadgeStyle: CSSProperties = {
  background: '#e2e8f0',
  color: '#334155',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 700,
};

const detailModalBodyStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
};

const detailSectionCardStyle: CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 14,
};

const detailSectionTitleStyle: CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 14,
  color: '#0f172a',
};

const detailSummaryGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const detailInfoTileStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '10px 12px',
  display: 'grid',
  gap: 4,
  color: '#1f2937',
  fontSize: 13,
};

const detailInfoLabelStyle: CSSProperties = {
  color: '#64748b',
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const detailCommentsListStyle: CSSProperties = {
  maxHeight: 320,
  overflow: 'auto',
  display: 'grid',
  gap: 8,
  marginBottom: 10,
};

const detailCommentCardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '9px 10px',
};

const detailCommentButtonStyle: CSSProperties = {
  border: '1px solid #1e3a8a',
  background: '#1e3a8a',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 12px',
  cursor: 'pointer',
};
