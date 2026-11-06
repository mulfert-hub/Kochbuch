declare const __APP_VERSION__: string;
declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Adresse der Familien-App – nur gesetzt, wenn das Kochbuch für sie gebaut wird */
  readonly VITE_FAMILIE_URL?: string;
}
