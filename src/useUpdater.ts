import { useEffect, useState, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "./api";

export interface UpdateInfo {
  available: boolean;
  version?: string;
  downloading: boolean;
  checking: boolean;
  progress: number;
  error?: string;
}

export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({
    available: false,
    downloading: false,
    checking: false,
    progress: 0,
  });

  // Cache the update object to avoid duplicate check() calls
  const updateRef = useRef<Update | null>(null);

  const checkForUpdates = async (): Promise<boolean> => {
    // Guard: only check for updates in Tauri environment
    if (!isTauri()) {
      if (import.meta.env.DEV) {
        console.log("Skipping update check: not in Tauri environment");
      }
      return false;
    }

    setUpdateInfo((prev) => ({ ...prev, checking: true, error: undefined }));
    try {
      const update = await check();
      updateRef.current = update;

      if (update) {
        setUpdateInfo({
          available: true,
          version: update.version,
          downloading: false,
          checking: false,
          progress: 0,
        });
        return true;
      } else {
        setUpdateInfo((prev) => ({
          ...prev,
          checking: false,
          available: false,
        }));
        return false;
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Failed to check for updates:", error);
      }
      setUpdateInfo((prev) => ({
        ...prev,
        checking: false,
        error: String(error),
      }));
      return false;
    }
  };

  const downloadAndInstall = async () => {
    // Guard: only download in Tauri environment
    if (!isTauri()) {
      return;
    }

    try {
      // Use cached update object if available, otherwise check again
      const update = updateRef.current ?? (await check());
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
      if (import.meta.env.DEV) {
        console.error("Failed to download/install update:", error);
      }
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
