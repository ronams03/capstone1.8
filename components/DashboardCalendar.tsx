import { useState } from 'react';

export type DashboardCalendarEvent = {
    start?: boolean;
    end?: boolean;
    projectIds: number[];
};

export type DashboardCalendarEventMap = Record<string, DashboardCalendarEvent>;

function buildMonth(year: number, month: number) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const daysInMonth = last.getDate();
    const cells: (number | null)[] = [];

    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
        weeks.push(cells.slice(i, i + 7));
    }

    return weeks;
}

type CalendarProps = {
    events?: DashboardCalendarEventMap;
    onDayClick?: (date: string) => void;
};

type CalendarMiniProps = CalendarProps & {
    onExpand: () => void;
    theme?: 'dark' | 'light';
};

export function DashboardCalendarMini({
    onExpand,
    events = {},
    onDayClick,
    theme = 'dark',
}: CalendarMiniProps) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [hoveredDate, setHoveredDate] = useState<string | null>(null);
    const weeks = buildMonth(year, month);
    const monthName = new Date(year, month, 1).toLocaleString(undefined, {
        month: 'long',
        year: 'numeric',
    });
    const isLightTheme = theme === 'light';
    const shellBackground = isLightTheme ? '#ffffff' : 'rgba(255,255,255,0.15)';
    const shellBorder = isLightTheme ? '#dbeafe' : 'rgba(255,255,255,0.3)';
    const shellColor = isLightTheme ? '#0f172a' : '#ffffff';
    const buttonBorder = isLightTheme ? '#bfdbfe' : 'rgba(255,255,255,0.4)';
    const buttonBackground = isLightTheme ? '#eff6ff' : 'transparent';
    const buttonColor = isLightTheme ? '#1e3a8a' : '#ffffff';
    const todayBackground = isLightTheme ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.25)';
    const hoverFallback = isLightTheme ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0.12)';
    const hoverOutline = isLightTheme ? 'inset 0 0 0 1px rgba(30,58,138,0.18)' : 'inset 0 0 0 1px rgba(255,255,255,0.35)';
    const isToday = (day: number | null) => {
        return day !== null
            && year === today.getFullYear()
            && month === today.getMonth()
            && day === today.getDate();
    };

    const prevMonth = () => {
        const nextMonth = month - 1;
        if (nextMonth < 0) {
            setMonth(11);
            setYear(year - 1);
            return;
        }
        setMonth(nextMonth);
    };

    const nextMonth = () => {
        const nextMonthValue = month + 1;
        if (nextMonthValue > 11) {
            setMonth(0);
            setYear(year + 1);
            return;
        }
        setMonth(nextMonthValue);
    };

    const prevYear = () => setYear(year - 1);
    const nextYear = () => setYear(year + 1);

    const renderDayCell = (day: number | null, index: number) => {
        const dateStr = day
            ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : '';
        const event = dateStr ? events[dateStr] : undefined;
        const clickable = !!(event && event.projectIds.length);
        const title = event
            ? [event.start ? 'Project start' : '', event.end ? 'Due date' : '']
                .filter(Boolean)
                .join(' & ')
            : '';

        return (
            <div
                key={index}
                onClick={() => clickable && onDayClick && onDayClick(dateStr)}
                onMouseEnter={() => dateStr && setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                title={title}
                style={{
                    textAlign: 'center',
                    padding: '4px 0',
                    borderRadius: 4,
                    background: hoveredDate === dateStr
                        ? event?.start && event?.end
                            ? 'linear-gradient(90deg, rgba(34,197,94,0.25), rgba(239,68,68,0.25))'
                            : event?.start
                                ? 'rgba(34,197,94,0.22)'
                                : event?.end
                                    ? 'rgba(239,68,68,0.22)'
                                    : isToday(day)
                                        ? todayBackground
                                        : hoverFallback
                        : isToday(day)
                            ? todayBackground
                            : 'transparent',
                    fontWeight: isToday(day) ? 700 : 400,
                    cursor: clickable ? 'pointer' : 'default',
                    position: 'relative',
                    boxShadow: hoveredDate === dateStr ? hoverOutline : undefined,
                }}
            >
                {day ?? ''}
                {event && (
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: 2,
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            gap: 3,
                        }}
                    >
                        {event.start && (
                            <span style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%' }} />
                        )}
                        {event.end && (
                            <span style={{ width: 6, height: 6, background: '#ef4444', borderRadius: '50%' }} />
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div
            style={{
                background: shellBackground,
                border: `1px solid ${shellBorder}`,
                color: shellColor,
                borderRadius: 8,
                padding: 8,
                boxShadow: isLightTheme ? '0 10px 24px rgba(30, 58, 138, 0.08)' : undefined,
                backdropFilter: isLightTheme ? undefined : 'blur(4px)',
                WebkitBackdropFilter: isLightTheme ? undefined : 'blur(4px)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={prevYear} title="Prev Year" style={{ background: buttonBackground, color: buttonColor, border: `1px solid ${buttonBorder}`, borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>{'<<'}</button>
                    <button onClick={prevMonth} title="Prev Month" style={{ background: buttonBackground, color: buttonColor, border: `1px solid ${buttonBorder}`, borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>{'<'}</button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{monthName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button onClick={nextMonth} title="Next Month" style={{ background: buttonBackground, color: buttonColor, border: `1px solid ${buttonBorder}`, borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>{'>'}</button>
                    <button onClick={nextYear} title="Next Year" style={{ background: buttonBackground, color: buttonColor, border: `1px solid ${buttonBorder}`, borderRadius: 4, padding: '0 4px', fontSize: 10, cursor: 'pointer' }}>{'>>'}</button>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10, opacity: 0.9 }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel, index) => (
                    <div key={index} style={{ textAlign: 'center', opacity: 0.8 }}>
                        {dayLabel}
                    </div>
                ))}
                {weeks.flat().map((day, index) => renderDayCell(day, index))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button onClick={onExpand} style={{ background: buttonBackground, color: buttonColor, border: `1px solid ${buttonBorder}`, borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}>Expand</button>
            </div>
        </div>
    );
}

type CalendarOverlayProps = CalendarProps & {
    open: boolean;
    onClose: () => void;
};

export function DashboardCalendarOverlay({
    open,
    onClose,
    events = {},
    onDayClick,
}: CalendarOverlayProps) {
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());
    const [hoveredDate, setHoveredDate] = useState<string | null>(null);
    const weeks = buildMonth(year, month);
    const monthName = new Date(year, month, 1).toLocaleString(undefined, {
        month: 'long',
        year: 'numeric',
    });
    const isToday = (day: number | null) => {
        return day !== null
            && year === today.getFullYear()
            && month === today.getMonth()
            && day === today.getDate();
    };

    const prevMonth = () => {
        const nextMonth = month - 1;
        if (nextMonth < 0) {
            setMonth(11);
            setYear(year - 1);
            return;
        }
        setMonth(nextMonth);
    };

    const nextMonth = () => {
        const nextMonthValue = month + 1;
        if (nextMonthValue > 11) {
            setMonth(0);
            setYear(year + 1);
            return;
        }
        setMonth(nextMonthValue);
    };

    const prevYear = () => setYear(year - 1);
    const nextYear = () => setYear(year + 1);

    if (!open) return null;

    const renderDayCell = (day: number | null, index: number) => {
        const dateStr = day
            ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            : '';
        const event = dateStr ? events[dateStr] : undefined;
        const clickable = !!(event && event.projectIds.length);
        const title = event
            ? [event.start ? 'Project start' : '', event.end ? 'Due date' : '']
                .filter(Boolean)
                .join(' & ')
            : '';

        return (
            <div
                key={index}
                onClick={() => clickable && onDayClick && onDayClick(dateStr)}
                onMouseEnter={() => dateStr && setHoveredDate(dateStr)}
                onMouseLeave={() => setHoveredDate(null)}
                title={title}
                style={{
                    textAlign: 'center',
                    padding: '10px 0',
                    borderRadius: 6,
                    background: hoveredDate === dateStr
                        ? event?.start && event?.end
                            ? 'linear-gradient(90deg, rgba(34,197,94,0.18), rgba(239,68,68,0.18))'
                            : event?.start
                                ? 'rgba(34,197,94,0.18)'
                                : event?.end
                                    ? 'rgba(239,68,68,0.18)'
                                    : isToday(day)
                                        ? 'rgba(30,58,138,0.2)'
                                        : 'rgba(17,24,39,0.05)'
                        : isToday(day)
                            ? 'rgba(30,58,138,0.15)'
                            : 'rgba(255,255,255,0.6)',
                    border: '1px solid #e5e7eb',
                    fontWeight: isToday(day) ? 700 : 500,
                    cursor: clickable ? 'pointer' : 'default',
                    position: 'relative',
                    boxShadow: hoveredDate === dateStr ? 'inset 0 0 0 2px rgba(30,58,138,0.2)' : undefined,
                }}
            >
                {day ?? ''}
                {event && (
                    <div
                        style={{
                            position: 'absolute',
                            left: '50%',
                            bottom: 6,
                            transform: 'translateX(-50%)',
                            display: 'flex',
                            gap: 4,
                        }}
                    >
                        {event.start && (
                            <span style={{ width: 7, height: 7, background: '#22c55e', borderRadius: '50%' }} />
                        )}
                        {event.end && (
                            <span style={{ width: 7, height: 7, background: '#ef4444', borderRadius: '50%' }} />
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 15000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
                style={{
                    width: '90%',
                    maxWidth: 800,
                    background: 'rgba(255,255,255,0.85)',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={prevYear} title="Prev Year" style={{ background: 'transparent', border: '1px solid #9ca3af', color: '#111827', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{'<<'}</button>
                        <button onClick={prevMonth} title="Prev Month" style={{ background: 'transparent', border: '1px solid #9ca3af', color: '#111827', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{'<'}</button>
                    </div>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{monthName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={nextMonth} title="Next Month" style={{ background: 'transparent', border: '1px solid #9ca3af', color: '#111827', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{'>'}</button>
                        <button onClick={nextYear} title="Next Year" style={{ background: 'transparent', border: '1px solid #9ca3af', color: '#111827', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>{'>>'}</button>
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, fontSize: 12, color: '#111827' }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel) => (
                        <div key={dayLabel} style={{ textAlign: 'center', opacity: 0.7, fontWeight: 600 }}>
                            {dayLabel}
                        </div>
                    ))}
                    {weeks.flat().map((day, index) => renderDayCell(day, index))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #9ca3af', color: '#111827', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        </div>
    );
}
