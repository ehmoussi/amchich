import { clsx, type ClassValue } from "clsx"
import { toast } from "sonner";
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function handleAsyncError(error: unknown, message: string): void {
    console.log(`${message}:`, error);
    toast.error(message);
}

export async function createSHA256CodeChallenge(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(hash));
}

function base64UrlEncode(bytes: Uint8Array): string {
    let bin = '';
    for (let b of bytes) bin += String.fromCharCode(b);
    const b64 = btoa(bin);
    // make it URL-safe
    return b64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
