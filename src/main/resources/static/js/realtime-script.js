const timezone = 'Europe/Kiev';

const dayFormatter    = new Intl.DateTimeFormat('en-US', { weekday: 'long',    timeZone: timezone });
const dayNumFormatter = new Intl.DateTimeFormat('en-GB', { day:     'numeric', timeZone: timezone });

const timeFormatter = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: timezone });
const logTimeFormatter = new Intl.DateTimeFormat('en-GB', { timeStyle: 'long', timeZone: timezone });
const dateFormatter = new Intl.DateTimeFormat('en-GB', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    timeZone: timezone 
});

function updateClock() {
    const now = new Date();
    
    const fullDayEl = document.getElementById("fullDay");
    const realTimeEl = document.getElementById("realTime");
    const dateEl = document.getElementById("date");

    const dateDayNumEl = document.getElementById("date-day-num");

    if (fullDayEl)     fullDayEl.textContent     = dayFormatter.format(now);
    if (dateDayNumEl)  dateDayNumEl.textContent  = dayNumFormatter.format(now);
    if (realTimeEl) realTimeEl.textContent = timeFormatter.format(now);
    
    if (dateEl) {
        // Formats to DD/MM/YYYY or YYYY/MM/DD depending on locale
        dateEl.textContent = dateFormatter.format(now).replace(/-/g, '/');
    }
}


updateClock();


setInterval(updateClock, 1000);