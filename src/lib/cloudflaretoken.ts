export function getCloudflareToken(): string | null {
    if (!import.meta.env.PROD) return "";
    const cookies = document.cookie.split(';');
    const cfAuthCookie = cookies.find(cookie => cookie.trim().startsWith('CF_Authorization='));
    if (cfAuthCookie) return cfAuthCookie.split('=')[1];
    return null;
} 