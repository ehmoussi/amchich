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
    const maxAge = 6 * 60 * 60;

    React.useEffect(() => {
        if (cookies.or_authorization !== undefined) return;
        let isMounted = true;
        getAPIKey()
            .then((apiKey) => {
                if (isMounted) {
                    setCookies(COOKIE_NAME, apiKey, { path: "/", maxAge, secure: true, sameSite: "strict" });
                    console.log("apiKey", apiKey);
                }
            })
            .catch((error: unknown) =>
                handleAsyncError(error, "Failed to retrieve an API key from OpenRouter")
            );

        return () => { isMounted = false; }
    }, []);

    return { apiKey: cookies.or_authorization ? decodeAPIKey(cookies.or_authorization) : undefined }
}

function decodeAPIKey(encodedAPIKey: string): string {
    const key = atob(encodedAPIKey);
    const salt = import.meta.env.VITE_OPENROUTER_KEY_SALT;
    const apiKey = key.replace(salt, "");
    return apiKey;
}

async function getAPIKey(): Promise<string> {
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/v1/openrouter/session`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
        }
    });
    const { key: key64 } = await response.json();
    return key64;
}
