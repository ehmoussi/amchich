import { clearOutboxEvents, updateLastEventId, type Outbox } from "./db";
import { getToken } from "./tokenutils";
import { handleAsyncError } from "./utils";

let syncInProgress = false;
let queuedEvents: Outbox[] = [];
let retryCount = 0;
let retryMax = 30;

export async function updateBackendEvents(events: Outbox[]) {
    queuedEvents.push(...events);
    if (queuedEvents.length === 0) return;
    if (syncInProgress) {
        if (retryCount > retryMax) {
            retryCount = 0;
            queuedEvents = [];
            return;
        }
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        retryCount += 1;
        setTimeout(() => updateBackendEvents(events), retryDelay);
        return;
    }
    retryCount = 0;
    syncInProgress = true;
    const currentEvents = [...queuedEvents];
    queuedEvents = [];
    let status: number | undefined;
    try {
        const token = await getToken();
        if (!token) {
            throw new Error("Failed to retrieve a token");
        }
        const body = JSON.stringify(currentEvents);
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/events`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body,
            },
        );
        status = response.status;
        const content = await response.json();
        if (!response.ok) {
            throw new Error(`Synchronization failed with status ${response.status}:\n${content}`);
        } else if (content.lastEventId !== undefined) {
            await updateLastEventId(content.lastEventId);
        }
        // Clear the events
        const eventIds = currentEvents.map((e) => e.id);
        await clearOutboxEvents(eventIds);
        setTimeout(() => {
            if (queuedEvents.length > 0) {
                updateBackendEvents([]);
            }
        }, 0);
    } catch (error: any) {
        // If the auth fail stop trying
        if (status && (status === 401 || status === 403)) {
        } else {
            queuedEvents.unshift(...currentEvents);
        }
        handleAsyncError(error, "Synchronization failed unexpectedly");
    } finally {
        syncInProgress = false;
    }
}