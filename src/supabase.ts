import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kdgavzsulrksnsdnsngu.supabase.co";
const supabaseAnonKey = "sb_publishable_R_4MREMAaP8sMuwn8GFUOQ__zforI-W";

// 注意：这是 Data API 的 publishable key
// 用于客户端访问，需要配合 RLS 策略使用

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 用户订阅状态类型
export interface UserProfile {
  id: string;
  email: string;
  is_subscribed: boolean;
  is_admin: boolean;
  daily_usage: number;
  last_usage_date: string;
}

// 每日免费使用次数
export const FREE_DAILY_LIMIT = 10;
