import { CSSProperties, InputHTMLAttributes, useId, useMemo, useState } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    containerClassName?: string;
    containerStyle?: CSSProperties;
    toggleButtonClassName?: string;
    toggleButtonStyle?: CSSProperties;
};

export default function PasswordInput({
    id,
    className,
    style,
    disabled,
    containerClassName,
    containerStyle,
    toggleButtonClassName,
    toggleButtonStyle,
    ...inputProps
}: PasswordInputProps) {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? `pwd-${generatedId}`;

    const mergedInputStyle = useMemo<CSSProperties>(() => {
        const next = { ...(style || {}) };
        if (next.paddingRight === undefined) {
            next.paddingRight = 40;
        }
        return next;
    }, [style]);

    return (
        <div
            className={containerClassName}
            style={{ position: 'relative', width: '100%', ...(containerStyle || {}) }}
        >
            <input
                {...inputProps}
                id={inputId}
                type={visible ? 'text' : 'password'}
                className={className}
                style={mergedInputStyle}
                disabled={disabled}
            />
            <button
                type="button"
                className={toggleButtonClassName}
                onClick={() => setVisible((prev) => !prev)}
                aria-label={visible ? 'Hide password' : 'Show password'}
                title={visible ? 'Hide password' : 'Show password'}
                disabled={disabled}
                style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    border: 'none',
                    background: 'transparent',
                    padding: 4,
                    cursor: disabled ? 'default' : 'pointer',
                    color: '#64748b',
                    opacity: disabled ? 0.6 : 1,
                    ...(toggleButtonStyle || {}),
                }}
            >
                {visible ? (
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C7 20 2.73 16.11 1 12c.74-1.64 1.82-3.1 3.17-4.28" />
                        <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" />
                        <path d="M9.88 5.09A10.94 10.94 0 0 1 12 4c5 0 9.27 3.89 11 8a10.94 10.94 0 0 1-1.69 2.86" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                ) : (
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                )}
            </button>
        </div>
    );
}
