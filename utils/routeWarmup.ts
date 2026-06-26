import type { NextRouter } from 'next/router';

const WARMED_ROUTES = new Set<string>();
let lastWarmAt = 0;

const ROUTE_WARMUP_COOLDOWN_MS = 350;
const MAX_BATCH_PREFETCHES = 4;

function canWarmRoute(routePath: string) {
    if (!routePath || WARMED_ROUTES.has(routePath)) return false;

    WARMED_ROUTES.add(routePath);
    return true;
}

export function warmRoute(router: Pick<NextRouter, 'prefetch'>, routePath: string) {
    if (!canWarmRoute(routePath)) return;

    router.prefetch(routePath).catch(() => {});
}

export function warmRoutes(router: Pick<NextRouter, 'prefetch'>, routePaths: string[]) {
    const now = Date.now();
    if (now - lastWarmAt < ROUTE_WARMUP_COOLDOWN_MS) return;
    lastWarmAt = now;

    let warmedCount = 0;
    for (const path of routePaths) {
        if (!canWarmRoute(path)) continue;

        router.prefetch(path).catch(() => {});
        warmedCount += 1;

        if (warmedCount >= MAX_BATCH_PREFETCHES) break;
    }
}
