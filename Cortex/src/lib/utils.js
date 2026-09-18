export { cn } from "cn";

/**
 * Validates whether an external URL is safe against dangerous schemes.
 * Whitelist: Must start with https:// or zoommtg://
 * Strictly rejects dangerous protocols like javascript:, data:, file:, vbscript:
 * 
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeMeetingUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return /^https:\/\//i.test(trimmed) || /^zoommtg:\/\//i.test(trimmed);
}
