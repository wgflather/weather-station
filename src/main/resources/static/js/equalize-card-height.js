// Equalizes the metric cards' height with the today block at narrow (≤480px)
// viewports. The today block's height is content-driven (it grows/shrinks with
// the cloud strip), so it can't be referenced from CSS — we measure it at
// runtime and push it to the cards through a CSS variable that only the ≤480px
// media query consumes. Above the breakpoint the variable is cleared so the
// cards fall back to their normal grid sizing.

const MOBILE_BREAKPOINT = 480;

const todayBlock = document.querySelector('.today_data_block');
const grid       = document.querySelector('.metrics-grid');

function syncCardHeight() {
    if (!todayBlock || !grid) return;

    if (window.innerWidth <= MOBILE_BREAKPOINT) {
        grid.style.setProperty('--today-card-h', `${Math.round(todayBlock.offsetHeight)}px`);
    } else {
        grid.style.removeProperty('--today-card-h');
    }
}

// The cloud strip renders asynchronously, so the today block's height settles
// after first paint — a ResizeObserver keeps the cards in step with every
// later change (data load, orientation change, dynamic content).
if (todayBlock) {
    new ResizeObserver(syncCardHeight).observe(todayBlock);
}
window.addEventListener('resize', syncCardHeight);
window.addEventListener('load', syncCardHeight);
syncCardHeight();
