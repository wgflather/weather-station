// modal-shell.js
//
// The open/close plumbing every dashboard modal needs: pinning the page behind
// it, and keeping Tab inside it.
//
// Both used to be per-modal. The astro modal and the history modal each locked
// <body> themselves, and because the second lock read `window.scrollY` while
// the body was *already* fixed, opening one over the other saved 0, clobbered
// the first modal's offset (the page jumped to the top behind it), and then
// fully unlocked the background on the first close — leaving a modal open over
// a scrollable page. A single lock counted by modal depth removes that whole
// class of bug: only the outermost open/close touches <body>.
//
// The reachable path into it was the missing focus trap. Neither modal
// contained Tab, so with one open, focus walked out to the controls behind it
// — the history button among them — and Enter opened a second modal. The trap
// below closes that path; the depth counter keeps the lock correct regardless.

// Innermost modal last. Depth is `stack.length`, so the lock and the trap can
// never disagree about how many modals are open.
const stack = [];

let savedScrollY = 0;

// iOS Safari + Android Chrome ignore `overflow: hidden` on <body> for touch
// scrolling, so the page underneath would still scroll while a modal is open —
// that's what produces the flicker (the URL bar collapses, the viewport
// reflows, the fixed backdrop appears to jump). The reliable fix is to pin
// <body> at a fixed position offset by the current scroll, then restore the
// offset on close so the user lands back where they were.
function applyLock() {
    savedScrollY = window.scrollY;
    const body = document.body;
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top      = `-${savedScrollY}px`;
    body.style.left     = '0';
    body.style.right    = '0';
    body.style.width    = '100%';
}

function releaseLock() {
    const body = document.body;
    body.style.overflow = '';
    body.style.position = '';
    body.style.top      = '';
    body.style.left     = '';
    body.style.right    = '';
    body.style.width    = '';
    window.scrollTo(0, savedScrollY);
}

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

// Visibility via getClientRects() rather than offsetParent: a modal panel sits
// inside a position:fixed container, and offsetParent is null for everything
// under one — which would make every candidate look hidden.
function focusableWithin(container) {
    return [...container.querySelectorAll(FOCUSABLE)]
        .filter(el => el.getClientRects().length > 0);
}

// Capture phase, bound once: focus may sit outside the modal (on <body> right
// after open), and a bubbling listener on the container would never see the
// keystroke that walks away from it.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || stack.length === 0) return;

    const container = stack[stack.length - 1];
    const items     = focusableWithin(container);
    if (items.length === 0) {
        e.preventDefault();
        return;
    }

    const first  = items[0];
    const last   = items[items.length - 1];
    const active = document.activeElement;

    if (!container.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
    }
}, true);

/** Pins the page and starts containing Tab inside `container`. */
export function enterModal(container) {
    stack.push(container);
    if (stack.length === 1) applyLock();
}

/**
 * Releases `container`. Idempotent — closing a modal that isn't open does
 * nothing, so the double-close paths (Escape plus a backdrop click) can't
 * unbalance the depth count. The page stays pinned while an outer modal is
 * still open.
 */
export function exitModal(container) {
    const i = stack.lastIndexOf(container);
    if (i === -1) return;
    stack.splice(i, 1);
    if (stack.length === 0) releaseLock();
}
