export interface HostInfo {
  host: Office.HostType | null;
  platform: Office.PlatformType | null;
}

/** Resolves when the Office.js runtime is ready to accept mailbox API calls. */
export function officeReady(): Promise<HostInfo> {
  return new Promise((resolve) => {
    Office.onReady((info) => {
      resolve({
        host: info.host ?? null,
        platform: info.platform ?? null,
      });
    });
  });
}
