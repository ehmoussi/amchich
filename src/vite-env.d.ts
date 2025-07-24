/// <reference types="vite/client" />

interface ViteTypeOptions {
    // By adding this line, you can make the type of ImportMetaEnv strict
    // to disallow unknown keys.
    // strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
    readonly VITE_BACKEND_URL: string
    readonly VITE_CLOUDFLARE_TEAM: string
    readonly VITE_OPENROUTER_KEY_SALT: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}