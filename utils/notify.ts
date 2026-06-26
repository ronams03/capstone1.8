import Swal, { type SweetAlertIcon, type SweetAlertOptions } from 'sweetalert2';

// Custom CSS for clock loader in SweetAlert2
const injectClockLoaderStyles = () => {
  if (typeof document === 'undefined') return;
  
  const styleId = 'swal-clock-loader-styles';
  if (document.getElementById(styleId)) return;
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* Custom clock loader animation for SweetAlert2 */
    .swal2-loading .swal2-loader {
      border-color: #1e3a8a transparent #1e3a8a transparent !important;
      border-width: 4px !important;
      width: 60px !important;
      height: 60px !important;
      animation: swal-rotate 1.2s linear infinite !important;
    }
    
    .swal2-loading .swal2-loader::before {
      content: '';
      position: absolute;
      width: 8px;
      height: 8px;
      background: #1e3a8a;
      border-radius: 50%;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    
    @keyframes swal-rotate {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* Enhanced loading modal styles */
    .swal-loading-modal {
      font-size: 16px !important;
    }
    
    .swal-loading-modal .swal2-title {
      color: #0f172a !important;
      font-size: 22px !important;
      font-weight: 700 !important;
      margin-bottom: 10px !important;
    }
    
    .swal-loading-modal .swal2-html-container {
      color: #475569 !important;
      font-size: 14px !important;
      line-height: 1.6 !important;
    }

    /* Large textarea modal for report editing */
    .swal-large-textarea-modal {
      max-width: 900px !important;
      width: 90% !important;
    }

    .swal-large-textarea-modal .swal2-popup {
      max-width: 900px !important;
      width: 90% !important;
    }

    .swal-large-textarea-modal .swal2-title {
      font-size: 24px !important;
      font-weight: 700 !important;
      margin-bottom: 12px !important;
    }

    .swal-large-textarea-modal .swal2-html-container {
      font-size: 14px !important;
      line-height: 1.6 !important;
      margin-bottom: 16px !important;
    }

    .swal-large-textarea-modal .swal2-input,
    .swal-large-textarea-modal .swal2-textarea {
      width: 100% !important;
      max-width: 100% !important;
      font-size: 14px !important;
      line-height: 1.7 !important;
      padding: 16px !important;
      border: 2px solid #e2e8f0 !important;
      border-radius: 8px !important;
      resize: vertical !important;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
    }

    .swal-large-textarea-modal .swal2-textarea {
      min-height: 400px !important;
      max-height: 70vh !important;
    }

    .swal-large-textarea-modal .swal2-input:focus,
    .swal-large-textarea-modal .swal2-textarea:focus {
      border-color: #1e3a8a !important;
      box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.1) !important;
      outline: none !important;
    }

    .swal-large-textarea-modal .swal2-input-label {
      font-size: 15px !important;
      font-weight: 600 !important;
      color: #1e293b !important;
      margin-bottom: 8px !important;
    }
  `;
  document.head.appendChild(style);
};

type ToastType = 'success' | 'info' | 'warning' | 'error';

interface ConfirmActionOptions {
  title?: string;
  text?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: SweetAlertIcon;
  danger?: boolean;
}

interface PromptActionOptions {
  title?: string;
  text?: string;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputValue?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  icon?: SweetAlertIcon;
  danger?: boolean;
  required?: boolean;
  large?: boolean; // Use large modal for editing long content
}

interface NotifyAPI {
  success: (message: string, duration?: number) => void | Promise<void>;
  info: (message: string, duration?: number) => void | Promise<void>;
  warning: (message: string, duration?: number) => void | Promise<void>;
  error: (message: string, duration?: number) => void | Promise<void>;
  auto: (message: string, duration?: number) => void | Promise<void>;
}

interface ToastAPI {
  show: (message: string, options?: { type?: ToastType; duration?: number }) => void | Promise<void>;
  success: (message: string, duration?: number) => void | Promise<void>;
  info: (message: string, duration?: number) => void | Promise<void>;
  error: (message: string, duration?: number) => void | Promise<void>;
}

declare global {
  interface Window {
    __nativeAlert?: typeof window.alert;
    __nativeFetch?: typeof window.fetch;
    __notifyInstalled?: boolean;
    __lastToastSignature?: string;
    __lastToastAt?: number;
    __lockdownState?: { enabled: boolean; reason?: string; updatedAt?: string };
    confirmAction?: (options?: ConfirmActionOptions) => Promise<boolean>;
    promptAction?: (options?: PromptActionOptions) => Promise<string | null>;
    notify?: NotifyAPI;
    toast?: ToastAPI;
  }
}

const modalDefaults = {
  background: '#ffffff',
  color: '#0f172a',
  confirmButtonColor: '#1e3a8a',
  cancelButtonColor: '#64748b',
  buttonsStyling: true,
  customClass: {
    popup: 'swal-modern-popup',
    title: 'swal-modern-title',
    htmlContainer: 'swal-modern-html',
    confirmButton: 'swal-modern-confirm',
    cancelButton: 'swal-modern-cancel',
  },
  showClass: {
    popup: 'swal-modern-in',
  },
  hideClass: {
    popup: 'swal-modern-out',
  },
} satisfies SweetAlertOptions;

const toast = Swal.mixin({
  ...modalDefaults,
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 1000,
  timerProgressBar: true,
  customClass: {
    popup: 'swal-modern-toast',
    title: 'swal-modern-toast-title',
  },
  showClass: {
    popup: 'swal-modern-toast-in',
  },
  hideClass: {
    popup: 'swal-modern-toast-out',
  },
});

const SWEET_ALERT_DURATION_MS = 1000;
const SAVE_NOTIFICATION_DURATION_MS = SWEET_ALERT_DURATION_MS;
const TOAST_DEDUPE_WINDOW_MS = 700;
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCKDOWN_EVENT_NAME = 'lockdown:active';
const LOCKDOWN_STATE_EVENT_NAME = 'lockdown:state';
const LOCKDOWN_STORAGE_KEY = 'lockdown_state';

function resolveAlertDuration(duration?: number): number {
  void duration;
  return SWEET_ALERT_DURATION_MS;
}

function isLockdownMessage(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes('system lockdown mode is active');
}

function extractLockdownReason(message: string): string {
  const idx = message.toLowerCase().indexOf('reason:');
  if (idx === -1) return '';
  return message.slice(idx + 7).trim();
}

function broadcastLockdownState(state: { enabled: boolean; reason?: string; updatedAt?: string }) {
  if (typeof window === 'undefined') return;
  window.__lockdownState = { enabled: state.enabled, reason: state.reason, updatedAt: state.updatedAt };
  try {
    window.localStorage.setItem(LOCKDOWN_STORAGE_KEY, JSON.stringify(window.__lockdownState));
  } catch {
    // Ignore storage failures.
  }
  try {
    window.dispatchEvent(new CustomEvent(LOCKDOWN_STATE_EVENT_NAME, { detail: window.__lockdownState }));
  } catch {
    // Ignore event dispatch failures.
  }
}

function broadcastLockdown(message: string) {
  if (typeof window === 'undefined') return;
  const reason = extractLockdownReason(message);
  broadcastLockdownState({ enabled: true, reason });
  try {
    window.dispatchEvent(new CustomEvent(LOCKDOWN_EVENT_NAME, { detail: { reason } }));
  } catch {
    // Ignore event dispatch failures.
  }
}

function toMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function detectTypeFromMessage(message: string): ToastType {
  const text = message.toLowerCase();
  if (
    /(error|fail|failed|invalid|denied|cannot|unable|forbidden|network|timeout|problem|wrong)/.test(text)
  ) {
    return 'error';
  }
  if (/(warn|warning|careful|attention|caution)/.test(text)) {
    return 'warning';
  }
  if (/(success|saved|created|updated|deleted|restored|completed|done|sent)/.test(text)) {
    return 'success';
  }
  return 'info';
}

function notifyToastDeduped(type: ToastType, message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  const text = toMessage(message).trim();
  if (!text || typeof window === 'undefined') return;
  if (isLockdownMessage(text)) {
    broadcastLockdown(text);
    return;
  }

  const signature = `${type}:${text.toLowerCase()}`;
  const now = Date.now();
  if (
    window.__lastToastSignature === signature &&
    typeof window.__lastToastAt === 'number' &&
    now - window.__lastToastAt < TOAST_DEDUPE_WINDOW_MS
  ) {
    return;
  }

  window.__lastToastSignature = signature;
  window.__lastToastAt = now;
  void notifyToast(type, text, duration);
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
}

export async function notifyToast(type: ToastType, message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  if (!message) return;
  if (isLockdownMessage(message)) {
    broadcastLockdown(message);
    return;
  }
  await toast.fire({
    icon: type,
    title: message,
    timer: resolveAlertDuration(duration),
  });
}

export async function notifySuccess(message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  await notifyToast('success', message, duration);
}

export async function notifyInfo(message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  await notifyToast('info', message, duration);
}

export async function notifyWarning(message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  await notifyToast('warning', message, duration);
}

export async function notifyError(message: string, duration = SAVE_NOTIFICATION_DURATION_MS) {
  if (isLockdownMessage(message)) {
    broadcastLockdown(message);
    return;
  }
  await notifyToast('error', message, duration);
}

export async function notifyAuto(message: string, duration = 3200) {
  await notifyToast(detectTypeFromMessage(message), message, duration);
}

export async function confirmAction(options: ConfirmActionOptions = {}): Promise<boolean> {
  const {
    title = 'Please confirm',
    text = 'Are you sure you want to continue?',
    confirmButtonText = 'Yes, continue',
    cancelButtonText = 'Cancel',
    icon = 'question',
    danger = false,
  } = options;

  const result = await Swal.fire({
    ...modalDefaults,
    icon,
    title,
    text,
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: danger ? '#dc2626' : '#1e3a8a',
  });

  return result.isConfirmed;
}

export async function promptAction(options: PromptActionOptions = {}): Promise<string | null> {
  const {
    title = 'Enter details',
    text = '',
    inputLabel = '',
    inputPlaceholder = '',
    inputValue = '',
    confirmButtonText = 'Continue',
    cancelButtonText = 'Cancel',
    icon = 'question',
    danger = false,
    required = false,
    large = false,
  } = options;

  // Inject styles if using large modal
  if (large) {
    injectClockLoaderStyles();
  }

  const result = await Swal.fire({
    ...modalDefaults,
    icon,
    title,
    text,
    input: 'textarea',
    inputLabel,
    inputPlaceholder,
    inputValue,
    inputAutoTrim: false,
    inputAttributes: {
      'aria-label': inputLabel || title,
      rows: large ? '20' : '8',
    },
    showCancelButton: true,
    reverseButtons: true,
    focusConfirm: false,
    confirmButtonText,
    cancelButtonText,
    confirmButtonColor: danger ? '#dc2626' : '#1e3a8a',
    customClass: {
      popup: large ? 'swal-large-textarea-modal' : '',
    },
    preConfirm: (value) => {
      const normalized = typeof value === 'string' ? value : '';
      if (required && normalized.trim() === '') {
        Swal.showValidationMessage('This field is required.');
        return false;
      }
      return normalized;
    },
  });

  if (!result.isConfirmed) {
    return null;
  }

  return typeof result.value === 'string' ? result.value : '';
}

/**
 * Show a loading modal with clock loader animation
 * Use this for long-running operations like sending reports/certificates
 */
export function showLoadingModal(title: string, html: string = '') {
  injectClockLoaderStyles();
  
  Swal.fire({
    title,
    html,
    icon: 'info',
    allowOutsideClick: false,
    showConfirmButton: false,
    willOpen: () => {
      Swal.showLoading();
    },
    customClass: {
      popup: 'swal-loading-modal',
    },
  });
}

/**
 * Update loading modal content
 */
export function updateLoadingModal(html: string) {
  Swal.update({ html });
}

/**
 * Close loading modal
 */
export function closeLoadingModal() {
  Swal.close();
}

export function installNotificationGlobals() {
  if (typeof window === 'undefined') return () => {};
  const win = window;

  if (win.__notifyInstalled) return () => {};
  win.__notifyInstalled = true;
  const previousAlert = win.alert.bind(win);
  const currentFetch = win.fetch.bind(win);

  // Preserve first-seen raw functions for callers that intentionally bypass wrappers.
  if (!win.__nativeAlert) {
    win.__nativeAlert = previousAlert;
  }
  if (!win.__nativeFetch) {
    win.__nativeFetch = currentFetch;
  }

  // Always execute against the preserved raw fetch to avoid wrapper recursion.
  const previousFetch = win.__nativeFetch.bind(win);

  const wrappedAlert: typeof window.alert = (message?: unknown) => {
    const text = toMessage(message);
    if (!text) return;
    notifyToastDeduped(detectTypeFromMessage(text), text, SAVE_NOTIFICATION_DURATION_MS);
  };
  win.alert = wrappedAlert;

  const wrappedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = getRequestMethod(input, init);
    const requestUrl = getRequestUrl(input);
    const shouldNotifyMutation =
      MUTATION_METHODS.has(method) && /\/api\//i.test(requestUrl);

    try {
      const response = await previousFetch(input, init);
      if (!shouldNotifyMutation) return response;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        let payload: unknown = null;
        try {
          payload = await response.clone().json();
        } catch {
          payload = null;
        }

        if (payload && typeof payload === 'object' && 'success' in payload) {
          const apiResponse = payload as { success?: unknown; message?: unknown; error?: unknown };
          const ok = Boolean(apiResponse.success);
          const rawMessage =
            apiResponse.message ??
            apiResponse.error;
          const message =
            toMessage(rawMessage) || (ok ? 'Saved successfully.' : 'Operation failed.');
          if (isLockdownMessage(message)) {
            broadcastLockdown(message);
            return response;
          }
          notifyToastDeduped(
            ok ? 'success' : 'error',
            message,
            SAVE_NOTIFICATION_DURATION_MS
          );
        } else if (!response.ok) {
          notifyToastDeduped(
            'error',
            `Request failed (${response.status})`,
            SAVE_NOTIFICATION_DURATION_MS
          );
        }
      } else if (!response.ok) {
        notifyToastDeduped(
          'error',
          `Request failed (${response.status})`,
          SAVE_NOTIFICATION_DURATION_MS
        );
      }

      return response;
    } catch (error) {
      if (shouldNotifyMutation) {
        notifyToastDeduped('error', 'Network error. Please try again.', SAVE_NOTIFICATION_DURATION_MS);
      }
      throw error;
    }
  }) as typeof window.fetch;
  win.fetch = wrappedFetch;

  window.confirmAction = confirmAction;
  window.promptAction = promptAction;
  window.notify = {
    success: (message: string, duration?: number) => notifySuccess(message, duration),
    info: (message: string, duration?: number) => notifyInfo(message, duration),
    warning: (message: string, duration?: number) => notifyWarning(message, duration),
    error: (message: string, duration?: number) => notifyError(message, duration),
    auto: (message: string, duration?: number) => notifyAuto(message, duration),
  };
  window.toast = {
    show: (message: string, options?: { type?: ToastType; duration?: number }) =>
      notifyToast(options?.type ?? 'success', message, options?.duration ?? SAVE_NOTIFICATION_DURATION_MS),
    success: (message: string, duration?: number) => notifySuccess(message, duration),
    info: (message: string, duration?: number) => notifyInfo(message, duration),
    error: (message: string, duration?: number) => notifyError(message, duration),
  };

  return () => {
    if (win.alert === wrappedAlert) {
      win.alert = previousAlert;
    }
    if (win.fetch === wrappedFetch) {
      win.fetch = previousFetch;
    }
    delete win.confirmAction;
    delete win.promptAction;
    delete win.notify;
    delete win.toast;
    win.__notifyInstalled = false;
  };
}
