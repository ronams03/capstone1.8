interface PaginationProps {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    label?: string;
    variant?: 'light' | 'dark';
}

type PageItem = number | 'ellipsis';

const buildPageItems = (currentPage: number, totalPages: number): PageItem[] => {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: PageItem[] = [1];
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    if (start > 2) items.push('ellipsis');
    for (let page = start; page <= end; page += 1) {
        items.push(page);
    }
    if (end < totalPages - 1) items.push('ellipsis');

    items.push(totalPages);
    return items;
};

export default function Pagination({
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
    label = 'items',
    variant = 'light',
}: PaginationProps) {
    if (totalItems === 0) return null;

    const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
    const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
    const start = (safeCurrentPage - 1) * itemsPerPage + 1;
    const end = Math.min(safeCurrentPage * itemsPerPage, totalItems);
    const pageItems = buildPageItems(safeCurrentPage, totalPages);
    const isDark = variant === 'dark';

    const colors = isDark
        ? {
            metaText: '#9fb3e0',
            buttonBorder: 'rgba(148, 163, 184, 0.35)',
            buttonBg: 'rgba(15, 23, 42, 0.8)',
            buttonText: '#dbe7ff',
            buttonDisabledBg: 'rgba(15, 23, 42, 0.45)',
            buttonDisabledText: '#6b7ea8',
            ellipsis: '#6b7ea8',
            activeBorder: '#3b82f6',
            activeBg: '#1d4ed8',
            activeText: '#ffffff',
        }
        : {
            metaText: '#64748b',
            buttonBorder: '#e2e8f0',
            buttonBg: '#ffffff',
            buttonText: '#334155',
            buttonDisabledBg: '#f8fafc',
            buttonDisabledText: '#94a3b8',
            ellipsis: '#94a3b8',
            activeBorder: '#1e3a8a',
            activeBg: '#1e3a8a',
            activeText: '#ffffff',
        };

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                marginTop: '14px',
            }}
        >
            <span style={{ fontSize: '13px', color: colors.metaText }}>
                Showing {start}-{end} of {totalItems} {label}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                    type="button"
                    onClick={() => onPageChange(safeCurrentPage - 1)}
                    disabled={safeCurrentPage <= 1}
                    style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: `1px solid ${colors.buttonBorder}`,
                        background: safeCurrentPage <= 1 ? colors.buttonDisabledBg : colors.buttonBg,
                        color: safeCurrentPage <= 1 ? colors.buttonDisabledText : colors.buttonText,
                        cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                    }}
                >
                    Prev
                </button>

                {pageItems.map((item, index) => {
                    if (item === 'ellipsis') {
                        return (
                            <span key={`ellipsis-${index}`} style={{ padding: '0 6px', color: colors.ellipsis }}>
                                ...
                            </span>
                        );
                    }

                    const isActive = item === safeCurrentPage;
                    return (
                        <button
                            key={`page-${item}`}
                            type="button"
                            onClick={() => onPageChange(item)}
                            style={{
                                minWidth: '32px',
                                padding: '6px 9px',
                                borderRadius: '6px',
                                border: `1px solid ${isActive ? colors.activeBorder : colors.buttonBorder}`,
                                background: isActive ? colors.activeBg : colors.buttonBg,
                                color: isActive ? colors.activeText : colors.buttonText,
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                            }}
                        >
                            {item}
                        </button>
                    );
                })}

                <button
                    type="button"
                    onClick={() => onPageChange(safeCurrentPage + 1)}
                    disabled={safeCurrentPage >= totalPages}
                    style={{
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: `1px solid ${colors.buttonBorder}`,
                        background: safeCurrentPage >= totalPages ? colors.buttonDisabledBg : colors.buttonBg,
                        color: safeCurrentPage >= totalPages ? colors.buttonDisabledText : colors.buttonText,
                        cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                    }}
                >
                    Next
                </button>
            </div>
        </div>
    );
}
