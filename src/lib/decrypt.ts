export async function decryptApiKey(encryptedKey: string, password: string) {
    const { salt, iv, ciphertext, tag } = JSON.parse(atob(encryptedKey));
    // Helper: Base64 to ArrayBuffer
    const bs2ab = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const saltBuf = bs2ab(salt);
    const ivBuf = bs2ab(iv);
    const ctBuf = bs2ab(ciphertext);
    const tagBuf = bs2ab(tag);
    // Import raw password for PBKDF2
    const pwKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    // Derive AES‑GCM key with 600 000 iterations
    const aesKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuf,
            iterations: 600_000,
            hash: "SHA-256",
        },
        pwKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
    // WebCrypto expects ciphertext||tag
    const encryptedBuf = new Uint8Array(ctBuf.byteLength + tagBuf.byteLength);
    encryptedBuf.set(ctBuf, 0);
    encryptedBuf.set(tagBuf, ctBuf.byteLength);
    try {
        const plainBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: ivBuf, tagLength: 128 },
            aesKey,
            encryptedBuf
        );
        return new TextDecoder().decode(plainBuf);
    } catch (e) {
        throw new Error("Decryption failed");
    }
}
