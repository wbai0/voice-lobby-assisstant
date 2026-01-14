import { useState, useCallback, useEffect } from "react";

// Storage schema version - increment when data structure changes
const STORAGE_VERSION = 1;
const VERSION_KEY = "pico_storage_version";

// Type definitions for stored data
export interface Template {
  name: string;
  items: ContentItem[];
}

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "photo"; index: number };

export interface FavoriteRoom {
  id: string;
  name: string;
}

export interface FavoriteUser {
  id: string;
  name: string;
}

// Validation functions
function isValidTemplate(obj: unknown): obj is Template {
  if (!obj || typeof obj !== "object") return false;
  const t = obj as Record<string, unknown>;
  if (typeof t.name !== "string") return false;
  if (!Array.isArray(t.items)) return false;
  return t.items.every(isValidContentItem);
}

function isValidContentItem(obj: unknown): obj is ContentItem {
  if (!obj || typeof obj !== "object") return false;
  const item = obj as Record<string, unknown>;
  if (item.type === "text") {
    return typeof item.content === "string";
  }
  if (item.type === "photo") {
    return typeof item.index === "number";
  }
  return false;
}

function isValidFavoriteRoom(obj: unknown): obj is FavoriteRoom {
  if (!obj || typeof obj !== "object") return false;
  const r = obj as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.name === "string";
}

function isValidFavoriteUser(obj: unknown): obj is FavoriteUser {
  if (!obj || typeof obj !== "object") return false;
  const u = obj as Record<string, unknown>;
  return typeof u.id === "string" && typeof u.name === "string";
}

// Generic localStorage hook with validation
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  validator?: (value: unknown) => value is T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return defaultValue;

      const parsed = JSON.parse(item);

      // If validator provided, use it
      if (validator) {
        if (validator(parsed)) {
          return parsed;
        }
        if (import.meta.env.DEV) {
          console.warn(
            `Invalid data in localStorage key "${key}", using default`
          );
        }
        return defaultValue;
      }

      return parsed as T;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn(`Error reading localStorage key "${key}":`, error);
      }
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(newValue));
        } catch (error) {
          if (import.meta.env.DEV) {
            console.error(`Error writing localStorage key "${key}":`, error);
          }
        }
        return newValue;
      });
    },
    [key]
  );

  return [storedValue, setValue];
}

// Specialized hooks for each data type
export function useTemplates() {
  const [templates, setTemplates] = useLocalStorage<Template[]>(
    "pico_templates_v2",
    [],
    (val): val is Template[] => Array.isArray(val) && val.every(isValidTemplate)
  );
  return { templates, setTemplates };
}

export function useDefaultTemplate() {
  const [defaultTemplate, setDefaultTemplate] = useLocalStorage<string>(
    "pico_default_template",
    "",
    (val): val is string => typeof val === "string"
  );
  return { defaultTemplate, setDefaultTemplate };
}

export function useFavoriteRooms() {
  const [favoriteRooms, setFavoriteRooms] = useLocalStorage<FavoriteRoom[]>(
    "pico_favorite_rooms",
    [],
    (val): val is FavoriteRoom[] =>
      Array.isArray(val) && val.every(isValidFavoriteRoom)
  );
  return { favoriteRooms, setFavoriteRooms };
}

export function useFavoriteUsers() {
  const [favoriteUsers, setFavoriteUsers] = useLocalStorage<FavoriteUser[]>(
    "pico_favorite_users",
    [],
    (val): val is FavoriteUser[] =>
      Array.isArray(val) && val.every(isValidFavoriteUser)
  );
  return { favoriteUsers, setFavoriteUsers };
}

export function useSidebarSplit() {
  const [sidebarSplit, setSidebarSplit] = useLocalStorage<number>(
    "pico_sidebar_split",
    50,
    (val): val is number => typeof val === "number" && val >= 20 && val <= 80
  );
  return { sidebarSplit, setSidebarSplit };
}

// Check and migrate storage version
export function useStorageVersionCheck() {
  useEffect(() => {
    const storedVersion = localStorage.getItem(VERSION_KEY);
    const currentVersion = storedVersion ? parseInt(storedVersion, 10) : 0;

    if (currentVersion < STORAGE_VERSION) {
      // Perform migrations here if needed
      // For now, just update the version
      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));

      if (import.meta.env.DEV) {
        console.log(
          `Storage migrated from v${currentVersion} to v${STORAGE_VERSION}`
        );
      }
    }
  }, []);
}
