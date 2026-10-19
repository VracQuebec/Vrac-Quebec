// No URL or environment setting can enable hosted EXEC-05 schema extensions.
export const EXEC05_HOSTED_ENABLED = false;
export const isExec05Local = () => typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && new URLSearchParams(window.location.search).get("finance_test") === "local";