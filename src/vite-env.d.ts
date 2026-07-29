/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_ENABLE_CLIENT_MIGRATIONS: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
