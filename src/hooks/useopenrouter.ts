import { handleAsyncError, } from "../lib/utils";
import React from "react";
import { useCookies } from "react-cookie";


interface CookieAPIKey {
    or_authorization?: string
}

interface OpenRouterAPI {
    apiKey: string | undefined;
}

const COOKIE_NAME = "or_authorization";
const RETRY_DELAY = 1000; // 1 second

export function useOpenRouter(): OpenRouterAPI {
    const [cookies, setCookies] = useCookies<string, CookieAPIKey>([COOKIE_NAME]);

    const storeAPIKey = React.useCallback(async (signal: AbortSignal) => {
        const maxRetries = 3;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const data = await fetchAPIKey(signal);
                setCookies(COOKIE_NAME, data.key, { path: "/", maxAge: data.max_age, secure: true, sameSite: "strict" });
                return;
            } catch (error: unknown) {
                if (signal.aborted) return;
                if (attempt === (maxRetries - 1) || (error instanceof Error && error.message.includes("Invalid API"))) {
                    handleAsyncError(error, "Failed to retrieve an API key from OpenRouter");
                    return;
                }
                await new Promise(resolve => {
                    const timeout = setTimeout(resolve, attempt * RETRY_DELAY);
                    signal.addEventListener("abort", () => clearTimeout(timeout));
                });
            };
        }
    }, [setCookies]);

    React.useEffect(() => {
        if (cookies.or_authorization !== undefined) return;
        const controller = new AbortController();
        storeAPIKey(controller.signal);
        return () => controller.abort();
    }, [cookies.or_authorization, storeAPIKey]);

    return { apiKey: cookies.or_authorization }
}


async function fetchAPIKey(signal: AbortSignal): Promise<{ key: string, max_age: number }> {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/openrouter/session`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const data = await response.json();
    if (!data.key || typeof data.max_age !== "number") {
        throw new Error("Invalid API");
    }
    return data;
}
