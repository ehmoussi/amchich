export async function getToken(signal?: AbortSignal): Promise<string | null> {
    let token = getAmchichCookie();
    if (token === null) {
        let authorization: { Authorization?: string } = {}
        if (import.meta.env.PROD) {
            const cloudflareToken = getCloudflareToken();
            if (cloudflareToken !== null) return null;
            authorization["Authorization"] = `Bearer ${cloudflareToken}`;
        }
        const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/api/v1/refresh`,
            {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...authorization
                },
                signal,
            }
        );
        if (response.ok && response.status === 200) {
            const json = await response.json();
            token = json.token;
            if (token !== null) {
                // Store the token in a cookie
                const maxAge = 60 * 60; // 1h
                setAmchichCookie(import.meta.env.VITE_AMCHICH_AUTH_COOKIE, token, maxAge)
            }
        }
    }
    return token;
}


export function getCloudflareToken(): string | null {
    if (!import.meta.env.PROD) return "";
    const cookies = document.cookie.split(';');
    const cfAuthCookie = cookies.find(cookie => cookie.trim().startsWith('CF_Authorization='));
    if (cfAuthCookie) return cfAuthCookie.split('=')[1];
    return null;
}

export function getAmchichCookie(): string | null {
    const cookies = document.cookie.split(';');
    const amchichAuthCookie = cookies.find(cookie => cookie.trim().startsWith(`${import.meta.env.VITE_AMCHICH_AUTH_COOKIE}=`));
    if (amchichAuthCookie) return amchichAuthCookie.split("=")[1];
    return null;
}

function setAmchichCookie(name: string, value: string, maxAge: number) {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; secure; samesite=strict; max-age=${maxAge}`;
}