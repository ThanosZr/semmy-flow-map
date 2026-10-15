declare module '*?url' {
  const src: string;
  export default src;
}

/** Present only when the page runs as a claude.ai artifact; used for the `downloads` capability. */
interface Window {
  claude?: { use?: (name: string) => Promise<unknown> };
}
