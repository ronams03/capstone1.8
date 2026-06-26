import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import Pagination from '@/components/Pagination';
import { getApiBaseUrl } from '@/utils/network';
import { notifyError } from '@/utils/notify';

const API = getApiBaseUrl();
const ITEMS_PER_PAGE = 10;

type SessionUser = {
  role?: string;
  employee_id?: number;
  [key: string]: unknown;
};

type InboxSummary = {
  total: number;
  overdue: number;
  due_soon: number;
  on_track: number;
  by_type: {
    leave: number;
    overtime: number;
    payslip_dispute: number;
  };
};

type InboxItem = {
  type: 'leave' | 'overtime' | 'payslip_dispute' | string;
  id: number;
  title: string;
  subtitle: string;
  submitted_at: string;
  sla_due_at: string;
  sla_status: 'overdue' | 'due_soon' | 'on_track' | string;
  sla_label: string;
  priority: 'low' | 'medium' | 'high' | string;
  link?: string;
  meta?: Record<string, unknown>;
};

type ApiResponse<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type InboxPayload = {
  summary: InboxSummary;
  items: InboxItem[];
};

type DisputeRow = {
  dispute_id: number;
  payroll_id: number;
  employee_id: number;
  employee_name?: string;
  issue_type: string;
  dispute_reason: string;
  expected_value?: number | null;
  current_value?: number | null;
  net_pay?: number | null;
  status: string;
  priority: string;
  sla_due_at?: string | null;
  resolution_notes?: string | null;
  pay_period_start?: string | null;
  pay_period_end?: string | null;
  created_at: string;
  resolved_at?: string | null;
  created_by_username?: string | null;
  resolved_by_username?: string | null;
};

type DisputeCommentRow = {
  comment_id: number;
  dispute_id: number;
  user_id: number;
  comment_text: string;
  created_at: string;
  commenter_name: string;
  commenter_role: string;
};

const emptySummary: InboxSummary = {
  total: 0,
  overdue: 0,
  due_soon: 0,
  on_track: 0,
  by_type: {
    leave: 0,
    overtime: 0,
    payslip_dispute: 0,
  },
};

export default function ApprovalInboxPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<InboxSummary>(emptySummary);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [typeFilter, setTypeFilter] = useState<'all' | 'leave' | 'overtime' | 'payslip_dispute'>('all');
  const [slaFilter, setSlaFilter] = useState<'all' | 'overdue' | 'due_soon' | 'on_track'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [activeDisputeId, setActiveDisputeId] = useState<number | null>(null);
  const [activeDispute, setActiveDispute] = useState<DisputeRow | null>(null);
  const [activeDisputeComments, setActiveDisputeComments] = useState<DisputeCommentRow[]>([]);
  const [activeDisputeCommentText, setActiveDisputeCommentText] = useState('');
  const [loadingDispute, setLoadingDispute] = useState(false);
  const [postingDisputeComment, setPostingDisputeComment] = useState(false);
  const role = String(user?.role || '').toLowerCase();
  const isManager = role === 'manager';
  const canManageDisputes = role === 'manager' || role === 'admin';

  useEffect(() => {
    const init = async () => {
      try {
        const sessionRes = await fetch(`${API}/auth.php`, { credentials: 'include' });
        const sessionData = (await sessionRes.json()) as ApiResponse<SessionUser>;
        if (!sessionData.success || !sessionData.data) {
          router.push('/');
          return;
        }

        const role = String(sessionData.data.role || '').toLowerCase();
        if (!['manager', 'admin'].includes(role)) {
          router.push('/dashboard');
          return;
        }

        setUser(sessionData.data);
        await fetchInbox('all', 'all');
      } catch {
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!error) return;
    void notifyError(error);
    setError('');
  }, [error]);

  useEffect(() => {
    if (!showDisputeModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showDisputeModal]);

  const fetchInbox = async (
    nextType: 'all' | 'leave' | 'overtime' | 'payslip_dispute',
    nextSla: 'all' | 'overdue' | 'due_soon' | 'on_track'
  ) => {
    setRefreshing(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('type', nextType);
      params.set('sla_status', nextSla);
      const res = await fetch(`${API}/approval-inbox.php?${params.toString()}`, { credentials: 'include' });
      const data = (await res.json()) as ApiResponse<InboxPayload>;
      if (data.success && data.data) {
        setSummary(data.data.summary || emptySummary);
        setItems(Array.isArray(data.data.items) ? data.data.items : []);
      } else {
        setSummary(emptySummary);
        setItems([]);
        setError(data.message || 'Failed to load approval inbox.');
      }
    } catch {
      setSummary(emptySummary);
      setItems([]);
      setError('Failed to load approval inbox.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleFilterChange = async (
    nextType: 'all' | 'leave' | 'overtime' | 'payslip_dispute',
    nextSla: 'all' | 'overdue' | 'due_soon' | 'on_track'
  ) => {
    setTypeFilter(nextType);
    setSlaFilter(nextSla);
    setCurrentPage(1);
    await fetchInbox(nextType, nextSla);
  };

  const fetchDisputePreview = async (disputeId: number) => {
    setLoadingDispute(true);
    setError('');
    try {
      const [detailRes, commentRes] = await Promise.all([
        fetch(`${API}/payslip-disputes.php?id=${disputeId}`, { credentials: 'include' }),
        fetch(`${API}/payslip-disputes.php?comments=1&dispute_id=${disputeId}`, { credentials: 'include' }),
      ]);
      const detailData = (await detailRes.json()) as ApiResponse<DisputeRow>;
      const commentData = (await commentRes.json()) as ApiResponse<DisputeCommentRow[]>;

      if (!detailData.success || !detailData.data) {
        setActiveDispute(null);
        setActiveDisputeComments([]);
        setError(detailData.message || 'Failed to load dispute details.');
        return;
      }

      setActiveDispute(detailData.data);
      setActiveDisputeComments(commentData.success && Array.isArray(commentData.data) ? commentData.data : []);
    } catch {
      setActiveDispute(null);
      setActiveDisputeComments([]);
      setError('Failed to load dispute details.');
    } finally {
      setLoadingDispute(false);
    }
  };

  const openDisputeModal = async (disputeId: number) => {
    setShowDisputeModal(true);
    setActiveDisputeId(disputeId);
    setActiveDispute(null);
    setActiveDisputeComments([]);
    setActiveDisputeCommentText('');
    await fetchDisputePreview(disputeId);
  };

  const closeDisputeModal = () => {
    setShowDisputeModal(false);
    setActiveDisputeId(null);
    setActiveDispute(null);
    setActiveDisputeComments([]);
    setActiveDisputeCommentText('');
    setLoadingDispute(false);
    setPostingDisputeComment(false);
  };

  const runAction = async (
    item: Pick<InboxItem, 'type' | 'id'>,
    action: 'approve' | 'reject' | 'in_review' | 'resolve'
  ): Promise<boolean> => {
    const actionKey = `${item.type}-${item.id}-${action}`;
    setActingOnId(actionKey);
    setError('');

    try {
      let requestUrl = '';
      let payload: Record<string, unknown> = {};

      if (item.type === 'leave') {
        requestUrl = `${API}/leave-requests.php`;
        payload = {
          leave_request_id: item.id,
          action: action === 'approve' ? 'approve' : 'reject',
        };
      } else if (item.type === 'overtime') {
        requestUrl = `${API}/overtime-requests.php`;
        payload = {
          overtime_request_id: item.id,
          status: action === 'approve' ? 'approved' : 'rejected',
          manager_notes: action === 'approve'
            ? 'Approved from manager approval inbox.'
            : 'Rejected from manager approval inbox.',
        };
      } else if (item.type === 'payslip_dispute') {
        requestUrl = `${API}/payslip-disputes.php`;
        payload = {
          dispute_id: item.id,
          status: action === 'in_review' ? 'in_review' : action === 'resolve' ? 'resolved' : 'rejected',
          resolution_notes: action === 'resolve'
            ? 'Resolved from manager approval inbox.'
            : action === 'reject'
              ? 'Rejected from manager approval inbox.'
              : 'Marked in review from manager approval inbox.',
        };
      }

      if (!requestUrl) {
        setError('Unsupported approval item type.');
        return false;
      }

      const res = await fetch(requestUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to update record.');
        return false;
      }

      setItems((prev) => prev.filter((i) => !(i.type === item.type && i.id === item.id)));
      return true;
    } catch {
      setError('Failed to update record.');
      return false;
    } finally {
      setActingOnId(null);
    }
  };

  const addDisputeComment = async () => {
    if (!activeDispute?.dispute_id) return;
    if (!activeDisputeCommentText.trim()) {
      setError('Comment is required.');
      return;
    }

    setPostingDisputeComment(true);
    setError('');
    try {
      const res = await fetch(`${API}/payslip-disputes.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'comment',
          dispute_id: activeDispute.dispute_id,
          comment: activeDisputeCommentText.trim(),
        }),
      });
      const data = (await res.json()) as ApiResponse<unknown>;
      if (!data.success) {
        setError(data.message || 'Failed to add comment.');
        return;
      }

      setActiveDisputeCommentText('');
      await fetchDisputePreview(activeDispute.dispute_id);
    } catch {
      setError('Failed to add comment.');
    } finally {
      setPostingDisputeComment(false);
    }
  };

  const runDisputeModalAction = async (action: 'in_review' | 'resolve' | 'reject') => {
    if (!activeDispute?.dispute_id) return;
    const ok = await runAction(
      {
        type: 'payslip_dispute',
        id: activeDispute.dispute_id,
      },
      action
    );
    if (ok && activeDispute) {
      const nextStatus: Record<string, string> = { in_review: 'in_review', resolve: 'resolved', reject: 'rejected' };
      setActiveDispute({ ...activeDispute, status: nextStatus[action] || activeDispute.status });
    }
  };

  const paginatedItems = useMemo(() => {
    return items.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  }, [items, currentPage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [items.length, currentPage]);

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
        <title>Approval Inbox</title>
      </Head>

      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 12 }}>
        <div style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Manager Approval Inbox</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
            Review leave, overtime, and payslip disputes with SLA reminders.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
          <SummaryCard label="Total Pending" value={summary.total} color="#1e3a8a" background="#dbeafe" />
          <SummaryCard label="Overdue SLA" value={summary.overdue} color="#b91c1c" background="#fee2e2" />
          <SummaryCard label="Due Soon" value={summary.due_soon} color="#92400e" background="#fef3c7" />
          <SummaryCard label="On Track" value={summary.on_track} color="#166534" background="#dcfce7" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
          <MiniCount label="Leave" value={summary.by_type.leave} />
          <MiniCount label="Overtime" value={summary.by_type.overtime} />
          <MiniCount label="Disputes" value={summary.by_type.payslip_dispute} />
          <button
            onClick={() => fetchInbox(typeFilter, slaFilter)}
            style={{
              border: '1px solid #1e3a8a',
              background: refreshing ? '#1e40af' : '#1e3a8a',
              color: '#fff',
              borderRadius: 10,
              padding: '10px 12px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {refreshing ? 'Refreshing...' : 'Refresh Inbox'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <select
            value={typeFilter}
            onChange={(e) => void handleFilterChange(e.target.value as 'all' | 'leave' | 'overtime' | 'payslip_dispute', slaFilter)}
            style={filterStyle}
          >
            <option value="all">All Types</option>
            <option value="leave">Leave</option>
            <option value="overtime">Overtime</option>
            <option value="payslip_dispute">Payslip Disputes</option>
          </select>
          <select
            value={slaFilter}
            onChange={(e) => void handleFilterChange(typeFilter, e.target.value as 'all' | 'overdue' | 'due_soon' | 'on_track')}
            style={filterStyle}
          >
            <option value="all">All SLA</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due Soon</option>
            <option value="on_track">On Track</option>
          </select>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Request</th>
                <th style={thStyle}>Submitted</th>
                <th style={thStyle}>SLA</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    No approval items found for selected filters.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const leaveTargetRole = String(item.meta?.employee_role || '').toLowerCase();
                  const isManagerRestrictedLeave = isManager && item.type === 'leave' && leaveTargetRole !== 'staff';
                  const approveDisabled = actingOnId === `${item.type}-${item.id}-approve`;
                  const rejectDisabled = actingOnId === `${item.type}-${item.id}-reject`;

                  return (
                    <tr key={`${item.type}-${item.id}`} style={{ borderTop: '1px solid #eef2f7' }}>
                      <td style={tdStyle}>
                        <span style={typeBadge(item.type)}>{formatType(item.type)}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.title}</div>
                        <div style={{ color: '#64748b', fontSize: 12 }}>{item.subtitle}</div>
                      </td>
                      <td style={tdStyle}>{new Date(item.submitted_at).toLocaleString()}</td>
                      <td style={tdStyle}>
                        <span style={slaBadge(item.sla_status)}>{item.sla_label}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={priorityBadge(item.priority)}>{String(item.priority || 'medium')}</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {item.type === 'leave' && (
                            <>
                              {!isManagerRestrictedLeave && (
                                <>
                                  <button
                                    onClick={() => void runAction(item, 'approve')}
                                    disabled={approveDisabled}
                                    style={approveDisabled ? { ...approveBtn, opacity: 0.6, cursor: 'not-allowed' } : approveBtn}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => void runAction(item, 'reject')}
                                    disabled={rejectDisabled}
                                    style={rejectDisabled ? { ...rejectBtn, opacity: 0.6, cursor: 'not-allowed' } : rejectBtn}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </>
                          )}
                          {item.type === 'overtime' && (
                            <>
                              <button
                                onClick={() => void runAction(item, 'approve')}
                                disabled={actingOnId === `${item.type}-${item.id}-approve`}
                                style={approveBtn}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => void runAction(item, 'reject')}
                                disabled={actingOnId === `${item.type}-${item.id}-reject`}
                                style={rejectBtn}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {item.type === 'payslip_dispute' && (
                            <button
                              onClick={() => void openDisputeModal(item.id)}
                              style={linkBtn}
                            >
                              View Dispute
                            </button>
                          )}
                          {item.type !== 'payslip_dispute' && (
                            <button
                              onClick={() => {
                                if (item.link) router.push(item.link);
                              }}
                              style={linkBtn}
                            >
                              Open
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalItems={items.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
          label="approval items"
        />
      </div>

      {showDisputeModal && (
        <div
          style={disputeModalOverlay}
          onClick={() => closeDisputeModal()}
        >
          <div
            style={disputeModalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={disputeModalHeader}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>
                  {activeDispute ? `Dispute #${activeDispute.dispute_id}` : activeDisputeId ? `Dispute #${activeDisputeId}` : 'Dispute'}
                </h2>
                <p style={{ margin: '6px 0 0 0', color: '#64748b', fontSize: 13 }}>
                  Full-screen review for payroll disputes without leaving the inbox.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activeDispute?.dispute_id && (
                  <button
                    onClick={() => router.push(`/payslip-disputes?dispute_id=${activeDispute.dispute_id}`)}
                    style={disputeSecondaryBtn}
                  >
                    Open Full Page
                  </button>
                )}
                <button
                  onClick={() => closeDisputeModal()}
                  style={disputeSecondaryBtn}
                >
                  Close
                </button>
              </div>
            </div>

            {!activeDispute ? (
              <div style={disputeEmptyState}>
                {loadingDispute ? 'Loading dispute details...' : 'Unable to load this dispute.'}
              </div>
            ) : (
              <>
                <div style={disputeModalToolbar}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={typeBadge('payslip_dispute')}>{formatType('payslip_dispute')}</span>
                    <span style={statusBadge(activeDispute.status)}>{activeDispute.status}</span>
                    <span style={priorityBadge(activeDispute.priority)}>{String(activeDispute.priority || 'medium')}</span>
                    <span style={disputeIssueBadge}>{formatIssueType(activeDispute.issue_type)}</span>
                    {loadingDispute && <span style={disputeLoadingText}>Refreshing details...</span>}
                  </div>
                  {canManageDisputes && ['submitted', 'in_review'].includes(activeDispute.status) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => void runDisputeModalAction('in_review')}
                        disabled={
                          activeDispute.status === 'in_review' ||
                          actingOnId === `payslip_dispute-${activeDispute.dispute_id}-in_review`
                        }
                        style={
                          activeDispute.status === 'in_review' || actingOnId === `payslip_dispute-${activeDispute.dispute_id}-in_review`
                            ? disabledButtonStyle(neutralBtn)
                            : neutralBtn
                        }
                      >
                        Mark In Review
                      </button>
                      <button
                        onClick={() => void runDisputeModalAction('resolve')}
                        disabled={actingOnId === `payslip_dispute-${activeDispute.dispute_id}-resolve`}
                        style={
                          actingOnId === `payslip_dispute-${activeDispute.dispute_id}-resolve`
                            ? disabledButtonStyle(approveBtn)
                            : approveBtn
                        }
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => void runDisputeModalAction('reject')}
                        disabled={actingOnId === `payslip_dispute-${activeDispute.dispute_id}-reject`}
                        style={
                          actingOnId === `payslip_dispute-${activeDispute.dispute_id}-reject`
                            ? disabledButtonStyle(rejectBtn)
                            : rejectBtn
                        }
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                <div style={disputeModalBody}>
                  <div style={{ display: 'grid', gap: 14 }}>
                    <div style={disputeSectionCard}>
                      <div style={disputeSectionTitle}>Dispute Summary</div>
                      <div style={disputeSummaryGrid}>
                        <InfoTile
                          label="Employee"
                          value={activeDispute.employee_name || `Employee #${activeDispute.employee_id}`}
                        />
                        <InfoTile label="Payroll ID" value={`#${activeDispute.payroll_id}`} />
                        <InfoTile
                          label="Pay Period"
                          value={`${activeDispute.pay_period_start || '-'} to ${activeDispute.pay_period_end || '-'}`}
                        />
                        <InfoTile
                          label="Issued At"
                          value={new Date(activeDispute.created_at).toLocaleString()}
                        />
                        <InfoTile
                          label="SLA Due"
                          value={activeDispute.sla_due_at ? new Date(activeDispute.sla_due_at).toLocaleString() : '-'}
                        />
                        <InfoTile
                          label="Resolved"
                          value={activeDispute.resolved_at ? new Date(activeDispute.resolved_at).toLocaleString() : '-'}
                        />
                      </div>
                    </div>

                    <div style={disputeSectionCard}>
                      <div style={disputeSectionTitle}>Financial Context</div>
                      <div style={disputeSummaryGrid}>
                        <InfoTile label="Expected Value" value={formatMoney(activeDispute.expected_value)} />
                        <InfoTile label="Current Value" value={formatMoney(activeDispute.current_value)} />
                        <InfoTile label="Net Pay" value={formatMoney(activeDispute.net_pay)} />
                        <InfoTile label="Created By" value={activeDispute.created_by_username || '-'} />
                        <InfoTile label="Resolved By" value={activeDispute.resolved_by_username || '-'} />
                        <InfoTile label="Issue Type" value={formatIssueType(activeDispute.issue_type)} />
                      </div>
                    </div>

                    <div style={disputeSectionCard}>
                      <div style={disputeSectionTitle}>Reason</div>
                      <div style={disputeLongText}>{activeDispute.dispute_reason}</div>
                    </div>

                    <div style={disputeSectionCard}>
                      <div style={disputeSectionTitle}>Resolution Notes</div>
                      <div style={disputeLongText}>
                        {activeDispute.resolution_notes || 'No resolution notes added yet.'}
                      </div>
                    </div>
                  </div>

                  <div style={disputeSidePanel}>
                    <div style={disputeSectionCard}>
                      <div style={disputeSectionTitle}>Discussion</div>
                      <div style={disputeCommentsList}>
                        {activeDisputeComments.length === 0 ? (
                          <div style={disputeMutedText}>No comments yet.</div>
                        ) : (
                          activeDisputeComments.map((comment) => (
                            <div key={comment.comment_id} style={disputeCommentCard}>
                              <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700 }}>
                                {comment.commenter_name} ({comment.commenter_role || 'user'})
                              </div>
                              <div style={{ fontSize: 13, color: '#1f2937', marginTop: 4 }}>{comment.comment_text}</div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                                {new Date(comment.created_at).toLocaleString()}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <textarea
                        value={activeDisputeCommentText}
                        onChange={(event) => setActiveDisputeCommentText(event.target.value)}
                        rows={4}
                        placeholder="Add a review comment..."
                        style={{ ...filterStyle, width: '100%', resize: 'vertical', minHeight: 110, marginTop: 12 }}
                      />
                      <button
                        onClick={() => void addDisputeComment()}
                        disabled={postingDisputeComment}
                        style={
                          postingDisputeComment
                            ? disabledButtonStyle({ ...linkBtn, width: '100%', marginTop: 10, padding: '10px 12px' })
                            : { ...linkBtn, width: '100%', marginTop: 10, padding: '10px 12px' }
                        }
                      >
                        {postingDisputeComment ? 'Posting Comment...' : 'Post Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

function formatType(value: string) {
  if (value === 'payslip_dispute') return 'Payslip Dispute';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SummaryCard({ label, value, color, background }: { label: string; value: number; color: string; background: string }) {
  return (
    <div style={{ background, border: '1px solid rgba(15,23,42,0.06)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: '1px solid #dbeafe', borderRadius: 10, padding: '10px 12px', background: '#f8fbff' }}>
      <div style={{ fontSize: 12, color: '#1e3a8a' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e3a8a' }}>{value}</div>
    </div>
  );
}

const filterStyle: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1f2937',
  minWidth: 180,
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

function typeBadge(type: string): CSSProperties {
  if (type === 'leave') return { background: '#dbeafe', color: '#1d4ed8', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (type === 'overtime') return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function slaBadge(status: string): CSSProperties {
  if (status === 'overdue') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'due_soon') return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function priorityBadge(priority: string): CSSProperties {
  if (priority === 'high') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (priority === 'low') return { background: '#e2e8f0', color: '#334155', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function statusBadge(status: string): CSSProperties {
  if (status === 'resolved') return { background: '#dcfce7', color: '#166534', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'rejected') return { background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'closed') return { background: '#e2e8f0', color: '#334155', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  if (status === 'in_review') return { background: '#ede9fe', color: '#6d28d9', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
  return { background: '#fef3c7', color: '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 700 };
}

function formatIssueType(value: string) {
  if (!value) return '-';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `PHP ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function disabledButtonStyle(base: CSSProperties): CSSProperties {
  return {
    ...base,
    opacity: 0.6,
    cursor: 'not-allowed',
  };
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={disputeInfoTile}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 13, color: '#0f172a', fontWeight: 600, lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

const approveBtn: CSSProperties = {
  border: '1px solid #16a34a',
  background: '#16a34a',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 9px',
  fontSize: 12,
  cursor: 'pointer',
};

const rejectBtn: CSSProperties = {
  border: '1px solid #dc2626',
  background: '#dc2626',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 9px',
  fontSize: 12,
  cursor: 'pointer',
};

const neutralBtn: CSSProperties = {
  border: '1px solid #475569',
  background: '#475569',
  color: '#fff',
  borderRadius: 7,
  padding: '6px 9px',
  fontSize: 12,
  cursor: 'pointer',
};

const linkBtn: CSSProperties = {
  border: '1px solid #1e3a8a',
  background: '#fff',
  color: '#1e3a8a',
  borderRadius: 7,
  padding: '6px 9px',
  fontSize: 12,
  cursor: 'pointer',
  fontWeight: 600,
};

const disputeModalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 16000,
  background: 'rgba(15, 23, 42, 0.68)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const disputeModalCard: CSSProperties = {
  width: 'min(1280px, 96vw)',
  height: 'min(92vh, 920px)',
  background: '#ffffff',
  borderRadius: 18,
  border: '1px solid rgba(148, 163, 184, 0.3)',
  boxShadow: '0 30px 70px rgba(15, 23, 42, 0.35)',
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const disputeModalHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  paddingBottom: 14,
  borderBottom: '1px solid #e2e8f0',
};

const disputeModalToolbar: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '14px 0',
  borderBottom: '1px solid #e2e8f0',
};

const disputeModalBody: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  paddingTop: 14,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
  gap: 14,
  alignItems: 'start',
};

const disputeSidePanel: CSSProperties = {
  minWidth: 0,
};

const disputeSectionCard: CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 14,
};

const disputeSectionTitle: CSSProperties = {
  marginBottom: 10,
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
};

const disputeSummaryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const disputeInfoTile: CSSProperties = {
  borderRadius: 12,
  padding: 12,
  background: '#f8fbff',
  border: '1px solid #dbeafe',
};

const disputeLongText: CSSProperties = {
  color: '#334155',
  fontSize: 14,
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap',
};

const disputeCommentsList: CSSProperties = {
  maxHeight: 420,
  overflow: 'auto',
  display: 'grid',
  gap: 10,
};

const disputeCommentCard: CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  padding: 12,
};

const disputeMutedText: CSSProperties = {
  color: '#64748b',
  fontSize: 13,
};

const disputeSecondaryBtn: CSSProperties = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#334155',
  borderRadius: 9,
  padding: '9px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const disputeLoadingText: CSSProperties = {
  color: '#64748b',
  fontSize: 12,
  fontWeight: 600,
};

const disputeEmptyState: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: 14,
};

const disputeIssueBadge: CSSProperties = {
  background: '#dbeafe',
  color: '#1d4ed8',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 12,
  fontWeight: 700,
};

