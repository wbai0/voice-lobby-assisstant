import { createClient } from "@supabase/supabase-js";

// Supabase configuration from environment variables
// For local development, create a .env file with:
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://kdgavzsulrksnsdnsngu.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_R_4MREMAaP8sMuwn8GFUOQ__zforI-W";

// Note: This is a publishable key for client-side access
// Security is enforced via Row Level Security (RLS) policies in Supabase

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: "pico-live-assistant-auth",
    storage: window.localStorage,
  },
});

// Subscription types
export type SubscriptionType = "free" | "trial" | "basic" | "premium";

// User subscription status type
export interface UserProfile {
  id: string;
  email: string;
  is_admin: boolean;
  diamonds: number;
  subscription_type: SubscriptionType;
  subscription_expires_at: string | null;
}

// Subscription plan
export interface SubscriptionPlan {
  id: number;
  type: "basic" | "premium";
  duration_days: number;
  duration_label: string;
  price_diamonds: number;
}

// Diamond transaction
export interface DiamondTransaction {
  id: number;
  user_id: string;
  amount: number;
  type: "recharge" | "subscribe" | "refund" | "gift";
  description: string | null;
  created_at: string;
}

// Daily free usage limit (保留兼容)
export const FREE_DAILY_LIMIT = 10;

// 订阅校验间隔（毫秒）
export const SUBSCRIPTION_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟
