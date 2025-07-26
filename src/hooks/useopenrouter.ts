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

export function useOpenRouter(): OpenRouterAPI {
    const [cookies, setCookies] = useCookies<string, CookieAPIKey>([COOKIE_NAME]);
    let maxAge = 1 * 60 * 60;

    React.useEffect(() => {
        if (cookies.or_authorization !== undefined) return;
        let isMounted = true;
        getAPIKey()
            .then((data) => {
                let delta = 0;
                if (isMounted && data.key !== undefined && data.expire_at !== undefined) {
                    delta = (data.expire_at * 1000 - Date.now()) / 1000;
                }
                if (delta > 0) {
                    if (delta < maxAge) maxAge = parseInt(delta.toString());
                    setCookies(COOKIE_NAME, data.key, { path: "/", maxAge, secure: true, sameSite: "strict" });
                    return;
                }
                throw new Error();
            })
            .catch((error: unknown) => handleAsyncError(error, "Failed to retrieve an API key from OpenRouter"));

        return () => { isMounted = false; }
    }, []);

    return { apiKey: cookies.or_authorization }
}


async function getAPIKey(): Promise<{ key: string, expire_at: number }> {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/openrouter/session`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
    });
    return await response.json();
}
