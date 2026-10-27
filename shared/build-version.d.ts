/**
 * Which build this code is: a new one for each build, and for each run of the dev server (vite.config.ts). A page and
 * the lobby server it talks to must be the same build, so a lobby turns away a hello from any other.
 */
declare const __BUILD_VERSION__: string;
