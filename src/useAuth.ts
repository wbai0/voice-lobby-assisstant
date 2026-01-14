import { useState, useEffect, useRef } from "react";
import { supabase, FREE_DAILY_LIMIT } from "./supabase";
import type { UserProfile } from "./supabase";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetched = useRef(false);

  // 获取用户 profile - 只调用一次
  const fetchProfile = async (userId: string) => {
    if (profileFetched.current) return;
    profileFetched.current = true;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          const today = new Date().toISOString().split("T")[0];
          const newProfile: Omit<UserProfile, "email"> = {
            id: userId,
            is_subscribed: false,
            is_admin: false,
            daily_usage: 0,
            last_usage_date: today,
          };
          await supabase.from("profiles").insert(newProfile);
          setProfile({ ...newProfile, email: "" } as UserProfile);
        }
        return;
      }
      setProfile(data);
    } catch (e) {
      console.error("fetchProfile error:", e);
    }
  };

  // 监听 auth 状态变化 - 只在挂载时运行一次
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        }
        setLoading(false);
      })
      .catch((e) => {
        clearTimeout(timeout);
        console.error("getSession error:", e);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user && !profileFetched.current) {
        fetchProfile(session.user.id);
      } else if (!session?.user) {
        setProfile(null);
        profileFetched.current = false;
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // 登录
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // 注册
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  // 登出
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  };

  // 检查是否可以使用功能
  const canUseFeature = (): { allowed: boolean; reason?: string } => {
    if (!profile) return { allowed: false, reason: "请先登录" };
    if (profile.is_subscribed || profile.is_admin) return { allowed: true };

    const today = new Date().toISOString().split("T")[0];
    const usageToday =
      profile.last_usage_date === today ? profile.daily_usage : 0;

    if (usageToday >= FREE_DAILY_LIMIT) {
      return {
        allowed: false,
        reason: `今日免费次数已用完 (${FREE_DAILY_LIMIT}次)，请订阅解锁无限使用`,
      };
    }
    return { allowed: true };
  };

  // 记录使用次数
  const recordUsage = async () => {
    if (!profile || profile.is_subscribed || profile.is_admin) return;

    const today = new Date().toISOString().split("T")[0];
    const isNewDay = profile.last_usage_date !== today;

    const newUsage = isNewDay ? 1 : profile.daily_usage + 1;

    await supabase
      .from("profiles")
      .update({
        daily_usage: newUsage,
        last_usage_date: today,
      })
      .eq("id", profile.id);

    setProfile({
      ...profile,
      daily_usage: newUsage,
      last_usage_date: today,
    });
  };

  // 获取剩余次数
  const getRemainingUsage = (): number | "unlimited" => {
    if (!profile) return 0;
    if (profile.is_subscribed || profile.is_admin) return "unlimited";

    const today = new Date().toISOString().split("T")[0];
    const usageToday =
      profile.last_usage_date === today ? profile.daily_usage : 0;
    return Math.max(0, FREE_DAILY_LIMIT - usageToday);
  };

  return {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    canUseFeature,
    recordUsage,
    getRemainingUsage,
  };
}
