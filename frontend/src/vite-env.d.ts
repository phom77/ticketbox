/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Support mailbox for organization name changes (Settings). Absent or invalid hides the link. */
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
