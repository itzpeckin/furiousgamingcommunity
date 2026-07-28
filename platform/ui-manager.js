(() => {
  'use strict';

  const HQ = window.FranchiseHQ;
  if (!HQ?.defineService) throw new Error('platform/core.js must load before platform/ui-manager.js.');

  const legacy = HQ.ui || {};
  const loadingRequests = new Map();
  const modalStack = [];
  const history = [];
  let sequence = 0;
  let hosts = null;
  let previousActiveElement = null;

  function id(prefix) {
    sequence += 1;
    return `${prefix}-${Date.now()}-${sequence}`;
  }

  function record(type, detail) {
    history.push(Object.freeze({ type, at: new Date().toISOString(), ...detail }));
    if (history.length > 100) history.splice(0, history.length - 100);
  }

  function injectStyles() {
    if (document.getElementById('fhq-ui-infrastructure-styles')) return;
    const style = document.createElement('style');
    style.id = 'fhq-ui-infrastructure-styles';
    style.textContent = `
      .fhq-ui-host{position:fixed;inset:0;pointer-events:none;z-index:var(--fhq-z-index-toast,1200)}
      .fhq-toast-stack{position:absolute;right:20px;bottom:20px;display:grid;gap:10px;width:min(380px,calc(100vw - 32px))}
      .fhq-toast{pointer-events:auto;display:grid;grid-template-columns:1fr auto;gap:12px;padding:14px 16px;border:1px solid var(--fhq-color-border);border-radius:var(--fhq-radius-md);background:var(--fhq-color-surface-raised);box-shadow:var(--fhq-shadow-raised);color:var(--fhq-color-text)}
      .fhq-toast strong,.fhq-toast p{display:block;margin:0}.fhq-toast p{margin-top:4px;color:var(--fhq-color-text-muted);font-size:.9rem}.fhq-toast button{border:0;background:transparent;color:inherit;cursor:pointer}
      .fhq-toast[data-type="success"]{border-left:4px solid var(--fhq-color-success)}.fhq-toast[data-type="warning"]{border-left:4px solid var(--fhq-color-warning)}.fhq-toast[data-type="error"]{border-left:4px solid var(--fhq-color-danger)}.fhq-toast[data-type="info"]{border-left:4px solid var(--fhq-color-info)}
      .fhq-loading-layer{position:fixed;inset:0;display:none;place-items:center;background:rgba(4,7,12,.64);backdrop-filter:blur(3px);pointer-events:auto;z-index:var(--fhq-z-index-loading,1250)}.fhq-loading-layer.is-active{display:grid}
      .fhq-loading-card{display:flex;align-items:center;gap:12px;padding:16px 20px;border:1px solid var(--fhq-color-border);border-radius:var(--fhq-radius-md);background:var(--fhq-color-surface-raised);box-shadow:var(--fhq-shadow-raised);color:var(--fhq-color-text)}
      .fhq-spinner{width:20px;height:20px;border:3px solid rgba(255,255,255,.2);border-top-color:var(--fhq-color-accent);border-radius:50%;animation:fhq-spin .8s linear infinite}@keyframes fhq-spin{to{transform:rotate(360deg)}}
      .fhq-modal-layer{position:fixed;inset:0;display:none;place-items:center;padding:24px;background:rgba(4,7,12,.72);backdrop-filter:blur(4px);pointer-events:auto;z-index:var(--fhq-z-index-modal,1300)}.fhq-modal-layer.is-active{display:grid}
      .fhq-modal{position:relative;width:min(680px,100%);max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--fhq-color-border);border-radius:var(--fhq-radius-lg);background:var(--fhq-color-surface-raised);box-shadow:var(--fhq-shadow-overlay);color:var(--fhq-color-text)}
      .fhq-modal__header,.fhq-modal__body,.fhq-modal__footer{padding:18px 20px}.fhq-modal__header{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid var(--fhq-color-border)}.fhq-modal__header h2{margin:0}.fhq-modal__close{border:0;background:transparent;color:inherit;cursor:pointer;font-size:1.35rem}.fhq-modal__footer{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--fhq-color-border)}
      .fhq-state{display:grid;justify-items:center;text-align:center;gap:8px;padding:32px 20px;border:1px dashed var(--fhq-color-border);border-radius:var(--fhq-radius-md);color:var(--fhq-color-text-muted)}.fhq-state h3,.fhq-state p{margin:0}.fhq-state h3{color:var(--fhq-color-text)}
    `;
    document.head.appendChild(style);
  }

  function ensureHosts() {
    if (hosts?.root?.isConnected) return hosts;
    injectStyles();
    const root = document.createElement('div');
    root.className = 'fhq-ui-host';
    root.dataset.fhqUiHost = '';
    root.innerHTML = '<div class="fhq-toast-stack" data-fhq-toast-host aria-live="polite" aria-relevant="additions"></div><div class="fhq-loading-layer" data-fhq-loading-host role="status" aria-live="polite"><div class="fhq-loading-card"><span class="fhq-spinner" aria-hidden="true"></span><span data-fhq-loading-message>Loading…</span></div></div><div class="fhq-modal-layer" data-fhq-modal-host></div>';
    document.body.appendChild(root);
    hosts = {
      root,
      toast: root.querySelector('[data-fhq-toast-host]'),
      loading: root.querySelector('[data-fhq-loading-host]'),
      loadingMessage: root.querySelector('[data-fhq-loading-message]'),
      modal: root.querySelector('[data-fhq-modal-host]')
    };
    hosts.modal.addEventListener('click', (event) => {
      if (event.target === hosts.modal) modal.close(undefined, { reason: 'backdrop' });
    });
    return hosts;
  }

  function normalizeNotice(input, fallbackType = 'info') {
    if (typeof input === 'string') return { type: fallbackType, title: input, message: '' };
    return { type: input?.type || fallbackType, title: input?.title || 'Franchise HQ', message: input?.message || '', durationMs: input?.durationMs ?? 4500 };
  }

  function notify(input) {
    const notice = normalizeNotice(input);
    const host = ensureHosts().toast;
    const noticeId = id('notice');
    const element = document.createElement('article');
    element.className = 'fhq-toast';
    element.dataset.type = notice.type;
    element.dataset.noticeId = noticeId;
    const content = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = notice.title;
    const message = document.createElement('p'); message.textContent = notice.message;
    const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Dismiss notification'); close.textContent = '×';
    content.append(title); if (notice.message) content.append(message); element.append(content, close); host.appendChild(element);
    const dismiss = () => { element.remove(); record('notification-dismissed', { id: noticeId }); };
    close.addEventListener('click', dismiss, { once: true });
    if (notice.durationMs > 0) window.setTimeout(dismiss, notice.durationMs);
    record('notification-shown', { id: noticeId, noticeType: notice.type });
    HQ.events?.emit?.('ui:notification-shown', { id: noticeId, ...notice });
    return Object.freeze({ id: noticeId, dismiss });
  }

  const toast = Object.freeze({
    success: (title, message, options = {}) => notify({ ...options, type: 'success', title, message }),
    warning: (title, message, options = {}) => notify({ ...options, type: 'warning', title, message }),
    error: (title, message, options = {}) => notify({ ...options, type: 'error', title, message }),
    info: (title, message, options = {}) => notify({ ...options, type: 'info', title, message })
  });

  const loading = Object.freeze({
    show(options = {}) {
      const requestId = id('loading');
      loadingRequests.set(requestId, { message: options.message || 'Loading…', at: Date.now() });
      const current = [...loadingRequests.values()].at(-1);
      const ui = ensureHosts(); ui.loadingMessage.textContent = current.message; ui.loading.classList.add('is-active');
      record('loading-shown', { id: requestId });
      return requestId;
    },
    hide(requestId) {
      if (requestId) loadingRequests.delete(requestId); else loadingRequests.clear();
      const ui = ensureHosts();
      if (loadingRequests.size === 0) ui.loading.classList.remove('is-active');
      else ui.loadingMessage.textContent = [...loadingRequests.values()].at(-1).message;
      record('loading-hidden', { id: requestId || null, remaining: loadingRequests.size });
      return loadingRequests.size;
    },
    count: () => loadingRequests.size,
    clear() { return this.hide(); }
  });

  function renderModal(entry) {
    const ui = ensureHosts();
    ui.modal.innerHTML = '';
    if (!entry) { ui.modal.classList.remove('is-active'); document.body.style.overflow = ''; previousActiveElement?.focus?.(); return; }
    const dialog = document.createElement('section');
    dialog.className = 'fhq-modal'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.dataset.modalId = entry.id;
    const header = document.createElement('header'); header.className = 'fhq-modal__header';
    const title = document.createElement('h2'); title.textContent = entry.options.title || 'Franchise HQ'; title.id = `${entry.id}-title`; dialog.setAttribute('aria-labelledby', title.id);
    const close = document.createElement('button'); close.className = 'fhq-modal__close'; close.type = 'button'; close.setAttribute('aria-label', 'Close dialog'); close.textContent = '×'; close.addEventListener('click', () => modal.close(entry.id, { reason: 'close-button' }));
    header.append(title, close);
    const body = document.createElement('div'); body.className = 'fhq-modal__body';
    if (entry.options.content instanceof Node) body.append(entry.options.content); else body.innerHTML = String(entry.options.content || '');
    dialog.append(header, body);
    if (entry.options.footer instanceof Node) { const footer = document.createElement('footer'); footer.className = 'fhq-modal__footer'; footer.append(entry.options.footer); dialog.append(footer); }
    ui.modal.append(dialog); ui.modal.classList.add('is-active'); document.body.style.overflow = 'hidden';
    queueMicrotask(() => (dialog.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') || dialog).focus?.());
  }

  const modal = Object.freeze({
    open(options = {}) {
      previousActiveElement = document.activeElement;
      const entry = { id: options.id || id('modal'), options, resolve: null };
      entry.closed = new Promise((resolve) => { entry.resolve = resolve; });
      modalStack.push(entry); renderModal(entry); record('modal-opened', { id: entry.id });
      HQ.events?.emit?.('ui:modal-opened', { id: entry.id });
      return Object.freeze({ id: entry.id, closed: entry.closed, close: (value) => modal.close(entry.id, { value }) });
    },
    close(modalId, result = {}) {
      const index = modalId ? modalStack.findIndex((entry) => entry.id === modalId) : modalStack.length - 1;
      if (index < 0) return false;
      const [entry] = modalStack.splice(index, 1); entry.resolve?.(result); renderModal(modalStack.at(-1)); record('modal-closed', { id: entry.id });
      HQ.events?.emit?.('ui:modal-closed', { id: entry.id, result }); return true;
    },
    closeAll(result = {}) { while (modalStack.length) this.close(modalStack.at(-1).id, result); },
    count: () => modalStack.length
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalStack.length) modal.close(undefined, { reason: 'escape' });
    if (event.key !== 'Tab' || !modalStack.length) return;
    const dialog = ensureHosts().modal.querySelector('.fhq-modal');
    const focusable = [...dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  function renderState(target, options, type) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(element instanceof Element)) throw new TypeError('A valid empty/error state target is required.');
    element.innerHTML = '';
    const state = document.createElement('section'); state.className = 'fhq-state'; state.dataset.stateType = type;
    const title = document.createElement('h3'); title.textContent = options?.title || (type === 'error' ? 'Something went wrong' : 'Nothing here yet');
    const message = document.createElement('p'); message.textContent = options?.message || '';
    state.append(title); if (message.textContent) state.append(message); element.append(state);
    return state;
  }

  const empty = Object.freeze({ show: (target, options = {}) => renderState(target, options, 'empty') });
  const error = Object.freeze({
    show(target, value = {}) {
      const normalized = HQ.errors?.normalize?.(value) || value;
      return renderState(target, { title: value.title || 'Something went wrong', message: value.message || normalized?.message || 'Please try again.' }, 'error');
    }
  });

  function diagnostics() {
    const ui = ensureHosts();
    const legacyDiagnostics = typeof legacy.diagnostics === 'function' ? legacy.diagnostics() : {};
    return Object.freeze({
      service: 'ui', version: '2.0',
      hosts: Object.freeze({ toast: ui.toast.isConnected, loading: ui.loading.isConnected, modal: ui.modal.isConnected }),
      activeLoadingRequests: loadingRequests.size, openModals: modalStack.length,
      recentActivity: Object.freeze(history.slice(-20)), legacy: legacyDiagnostics
    });
  }

  const service = {
    ...legacy,
    notify,
    toast: Object.assign((title, message, options = {}) => legacy.toast?.(title, message, options) ?? notify({ title, message, ...options }), toast),
    loading,
    modal,
    empty,
    error,
    ensureHosts,
    diagnostics
  };

  HQ.defineService('ui', service, { replace: true });
  const mount = () => ensureHosts();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
