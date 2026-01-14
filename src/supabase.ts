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

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// User subscription status type
export interface UserProfile {
  id: string;
  email: string;
  is_subscribed: boolean;
  is_admin: boolean;
  daily_usage: number;
  last_usage_date: string;
}

// Daily free usage limit
export const FREE_DAILY_LIMIT = 10;
