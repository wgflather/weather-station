// FetchScheduler.js
export class FetchScheduler {

    constructor(fetchChartFn, renderFn, bufferMs = 59000) {
        this.fetchChartFn = fetchChartFn;
        this.renderFn = renderFn;
        this.bufferMs = bufferMs;

        this.resolution = 10;

        this.timers = {
            temperature: null,
            pressure: null
        };
    }

    start(metric, getChartFn, resolution) {
        this.stop(metric);

        this.resolution = resolution ?? this.resolution; // ✅ IMPORTANT

        const run = async () => {
            try {
                const existingChart = getChartFn(metric);

                const chartDto = await this.fetchChartFn(
                    metric,
                    existingChart,
                    this.resolution   // ✅ FIX HERE
                );

                if (!chartDto) return;

                this.renderFn(chartDto.chartPoints, metric);
                this.schedule(metric, chartDto.nextBucketExpectedAt, getChartFn);

            } catch (err) {
                console.error(`Scheduler error for [${metric}]:`, err);

                this.schedule(
                    metric,
                    new Date(Date.now() + 10000).toISOString(),
                    getChartFn
                );
            }
        };

        run();
    }

    stop(metric) {
        if (metric) {
            if (this.timers[metric]) {
                clearTimeout(this.timers[metric]);
                this.timers[metric] = null;
            }
        } else {
            Object.keys(this.timers).forEach(m => {
                if (this.timers[m]) {
                    clearTimeout(this.timers[m]);
                    this.timers[m] = null;
                }
            });
        }
    }

    schedule(metric, nextBucketExpectedAt, getChartFn) {
        if (this.timers[metric]) {
            clearTimeout(this.timers[metric]);
        }

        if (!nextBucketExpectedAt) return;

        const now = Date.now();
        const next = new Date(nextBucketExpectedAt).getTime();

        // Target delay is the distance to the next bucket plus your buffer margin
        let delay = (next - now) + this.bufferMs;

        // FIX: If the target timestamp is already in the past, the server is lagging.
        // Do NOT spam every 1 second. Back off to a standard 30-second cycle 
        // to give the server breathing room to generate the data.
        if (delay <= 0) {
            console.warn(`[${metric}] Server timestamp is in the past. Backing off to 30s polling.`);
            delay = 30000; 
        } else {
            // Enforce a reasonable minimum floor (e.g., 10 seconds) for general sanity
            delay = Math.max(delay, 10000);
        }

        this.timers[metric] = setTimeout(() => {
            this.start(metric, getChartFn, this.resolution);
        }, delay);
    }
}