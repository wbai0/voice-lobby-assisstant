import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export interface UpdateInfo {
  available: boolean;
  version?: string;
  downloading: boolean;
  progress: number;
  error?: string;
}

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    downloading: false,
    progress: 0,
  });

  const checkForUpdates = async () => {
    try {
      const update = await check();
      if (update) {
        setUpdateInfo({
          available: true,
          version: update.version,
          downloading: false,
          progress: 0,
        });
        return update;
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      setUpdateInfo((prev) => ({
        ...prev,
        error: String(error),
      }));
    }
    return null;
  };

  const downloadAndInstall = async () => {
    try {
      const update = await check();
      if (!update) return;

      setUpdateInfo((prev) => ({ ...prev, downloading: true, progress: 0 }));

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          contentLength =
            (event.data as { contentLength?: number }).contentLength || 0;
          setUpdateInfo((prev) => ({ ...prev, progress: 0 }));
        } else if (event.event === "Progress") {
          downloaded += (event.data as { chunkLength: number }).chunkLength;
          const progress =
            contentLength > 0
              ? Math.round((downloaded / contentLength) * 100)
              : 0;
          setUpdateInfo((prev) => ({ ...prev, progress }));
        } else if (event.event === "Finished") {
          setUpdateInfo((prev) => ({ ...prev, progress: 100 }));
        }
      });

      // Relaunch the app after update
      await relaunch();
    } catch (error) {
      console.error("Failed to download/install update:", error);
      setUpdateInfo((prev) => ({
        ...prev,
        downloading: false,
        error: String(error),
      }));
    }
  };

  // Check for updates on mount
  useEffect(() => {
    checkForUpdates();
  }, []);

  return {
    ...updateInfo,
    checkForUpdates,
    downloadAndInstall,
  };
}
