export const DEFAULT_PHONE_COUNTRY_CODE = '+63';

function sanitizeCountryCode(value: unknown, fallback = DEFAULT_PHONE_COUNTRY_CODE): string {
    const raw = String(value ?? '').trim();
    const digits = raw.replace(/\D+/g, '');
    if (!digits) {
        return fallback;
    }
    return `+${digits}`;
}

export function sanitizeInternationalPhoneDraft(value: unknown): string {
    const raw = String(value ?? '');
    if (!raw) return '';

    let sanitized = raw.replace(/[^\d+]/g, '');
    if (sanitized.startsWith('00')) {
        sanitized = `+${sanitized.slice(2)}`;
    }

    if (sanitized.startsWith('+')) {
        sanitized = `+${sanitized.slice(1).replace(/\+/g, '')}`;
    } else {
        sanitized = sanitized.replace(/\+/g, '');
    }

    return sanitized;
}

export function isPhoneDraftEmpty(value: unknown, defaultCountryCode = DEFAULT_PHONE_COUNTRY_CODE): boolean {
    const draft = sanitizeInternationalPhoneDraft(value).trim();
    const countryCode = sanitizeCountryCode(defaultCountryCode);
    return draft === '' || draft === '+' || draft === countryCode;
}

export function normalizeInternationalPhoneNumber(
    value: unknown,
    defaultCountryCode = DEFAULT_PHONE_COUNTRY_CODE
): string {
    const fallbackCode = sanitizeCountryCode(defaultCountryCode);
    const fallbackDigits = fallbackCode.slice(1);
    let draft = sanitizeInternationalPhoneDraft(value).trim();

    if (draft === '' || draft === '+' || draft === fallbackCode) {
        return '';
    }

    if (!draft.startsWith('+')) {
        const digits = draft.replace(/\D+/g, '');
        if (!digits) return '';

        const normalizedLocalDigits = digits.replace(/^0+/, '') || digits;
        if (normalizedLocalDigits.startsWith(fallbackDigits)) {
            draft = `+${normalizedLocalDigits}`;
        } else {
            draft = `${fallbackCode}${normalizedLocalDigits}`;
        }
    }

    const digits = draft.slice(1).replace(/\D+/g, '');
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
        return '';
    }

    return `+${digits}`;
}

export function isValidInternationalPhoneNumber(
    value: unknown,
    defaultCountryCode = DEFAULT_PHONE_COUNTRY_CODE
): boolean {
    return normalizeInternationalPhoneNumber(value, defaultCountryCode) !== '';
}

export function getPhoneInputDefault(
    value: unknown,
    defaultCountryCode = DEFAULT_PHONE_COUNTRY_CODE
): string {
    const normalized = normalizeInternationalPhoneNumber(value, defaultCountryCode);
    if (normalized) return normalized;

    const draft = sanitizeInternationalPhoneDraft(value).trim();
    const countryCode = sanitizeCountryCode(defaultCountryCode);
    if (!draft) return countryCode;
    if (draft.startsWith('+')) return draft;

    const digits = draft.replace(/\D+/g, '');
    if (!digits) return countryCode;

    const normalizedLocalDigits = digits.replace(/^0+/, '') || digits;
    return `${countryCode}${normalizedLocalDigits}`;
}

// Backward-compatible aliases for existing imports.
export function normalizePhilippineMobileNumber(value: unknown): string {
    return normalizeInternationalPhoneNumber(value, DEFAULT_PHONE_COUNTRY_CODE);
}

export function isValidPhilippineMobileNumber(value: unknown): boolean {
    return isValidInternationalPhoneNumber(value, DEFAULT_PHONE_COUNTRY_CODE);
}
