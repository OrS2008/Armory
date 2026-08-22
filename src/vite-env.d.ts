/// <reference types="vite/client" />

/** Short commit the bundle was built from; "dev" outside a Pages build. */
declare const __BUILD_REF__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
