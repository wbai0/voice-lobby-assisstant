import { invoke } from "@tauri-apps/api/core";

// Detect if running in Tauri environment
const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI__" in window;
};

// Conditional logger - only logs in development
const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

// Types
export interface MumuInstance {
  index: number;
  name: string;
  port: number;
  running: boolean;
  display_name: string;
}

export interface AdbInfo {
  path: string;
  found: boolean;
  is_custom: boolean;
  bundled_path?: string;
  exe_path?: string;
}

// ADB API
export const adbApi = {
  status: async (): Promise<{
    data: { connected: boolean; port: number | null };
  }> => {
    if (isTauri()) {
      const [connected, port] =
        await invoke<[boolean, number | null]>("cmd_adb_status");
      return { data: { connected, port } };
    }
    return { data: { connected: false, port: null } };
  },

  instances: async (): Promise<{ data: MumuInstance[] }> => {
    if (isTauri()) {
      const data = await invoke<MumuInstance[]>("cmd_adb_scan_instances");
      return { data };
    }
    return { data: [] };
  },

  connect: async (
    port: number,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_adb_connect", { port });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  disconnect: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_adb_disconnect");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  getInfo: async (): Promise<{ data: AdbInfo }> => {
    if (isTauri()) {
      const data = await invoke<AdbInfo>("cmd_adb_get_info");
      return { data };
    }
    return { data: { path: "adb", found: false, is_custom: false } };
  },

  setPath: async (
    path: string,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_adb_set_path", { path });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  detectPage: async (): Promise<{ data: string }> => {
    if (isTauri()) {
      const page = await invoke<string>("cmd_detect_page");
      return { data: page };
    }
    return { data: "unknown" };
  },

  openRoom: async (
    roomId: string,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_open_room", { roomId });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  openChat: async (
    uid: string,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_open_chat", { uid });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  openUser: async (
    uid: string,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_open_user", { uid });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  openMessageList: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_open_message_list");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  openRoute: async (
    route: string,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_open_route", { route });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  tapMeTab: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_tap_me_tab");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  tapNovaUserList: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_tap_nova_user_list");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  tapAt: async (
    x: number,
    y: number,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_tap_at", { x, y });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  navigateToNovaList: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_navigate_to_nova_list");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },
};

// Logs API
export const logsApi = {
  get: async (count = 50): Promise<{ data: { logs: string[] } }> => {
    if (isTauri()) {
      const logs = await invoke<string[]>("cmd_get_logs", { count });
      return { data: { logs } };
    }
    return { data: { logs: [] } };
  },

  clear: async (): Promise<{ data: { success: boolean } }> => {
    if (isTauri()) {
      await invoke("cmd_clear_logs");
      return { data: { success: true } };
    }
    return { data: { success: false } };
  },

  setAdmin: async (isAdmin: boolean): Promise<void> => {
    if (isTauri()) {
      await invoke("cmd_set_admin", { isAdmin });
    }
  },
};

// Content item type
export type ContentItem =
  | { type: "text"; content: string }
  | { type: "photo"; index: number };

// Auto Message API
export const autoMessageApi = {
  start: async (
    items: ContentItem[],
    maxUsers: number,
    delay: number,
  ): Promise<{ data: { success: boolean; message: string } }> => {
    devLog("autoMessageApi.start called, isTauri:", isTauri());
    if (isTauri()) {
      const message = await invoke<string>("cmd_start", {
        items,
        maxUsers,
        delay,
      });
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  stop: async (): Promise<{ data: { success: boolean; message: string } }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_stop");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },

  status: async (): Promise<{
    data: {
      running: boolean;
      processed: number;
      total: number;
      current_page: string;
      ui_detection_in_progress: boolean;
    };
  }> => {
    if (isTauri()) {
      const data = await invoke<{
        running: boolean;
        processed: number;
        total: number;
        current_page: string;
        ui_detection_in_progress: boolean;
      }>("cmd_status");
      return { data };
    }
    return {
      data: {
        running: false,
        processed: 0,
        total: 0,
        current_page: "unknown",
        ui_detection_in_progress: false,
      },
    };
  },

  testInChat: async (
    items: ContentItem[],
  ): Promise<{ data: { success: boolean; message: string } }> => {
    devLog(
      "autoMessageApi.testInChat called, isTauri:",
      isTauri(),
      "items:",
      items,
    );
    if (isTauri()) {
      try {
        devLog("Invoking cmd_test_in_chat...");
        const message = await invoke<string>("cmd_test_in_chat", {
          items,
        });
        devLog("cmd_test_in_chat result:", message);
        return { data: { success: true, message } };
      } catch (e) {
        console.error("cmd_test_in_chat error:", e);
        throw e;
      }
    }
    devLog("Not in Tauri, returning false");
    return { data: { success: false, message: "Not in Tauri" } };
  },
};

// UI Automator API
export const uiAutomatorApi = {
  test: async (): Promise<{ data: string }> => {
    if (isTauri()) {
      const data = await invoke<string>("cmd_test_ui_automator");
      return { data };
    }
    return { data: "Not in Tauri" };
  },

  navigateToNewbieList: async (): Promise<{
    data: { success: boolean; message: string };
  }> => {
    if (isTauri()) {
      const message = await invoke<string>("cmd_navigate_to_newbie_list");
      return { data: { success: true, message } };
    }
    return { data: { success: false, message: "Not in Tauri" } };
  },
};

export { isTauri };
