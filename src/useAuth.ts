import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, FREE_DAILY_LIMIT } from "./supabase";
import type { UserProfile } from "./supabase";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const profileFetched = useRef(false);
  const currentUserId = useRef<string | null>(null);

  // Fetch user profile - with force refresh option
  const fetchProfile = useCallback(async (userId: string, force = false) => {
    // Skip if already fetched for this user (unless forced)
    if (profileFetched.current && currentUserId.current === userId && !force) {
      return;
    }

    profileFetched.current = true;
    currentUserId.current = userId;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // Profile doesn't exist, create one
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
        } else if (import.meta.env.DEV) {
          console.error("fetchProfile error:", error);
        }
        return;
      }
      setProfile(data);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("fetchProfile error:", e);
      }
    }
  }, []);

  // Refresh profile data (useful after mutations)
  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, true);
    }
  }, [user?.id, fetchProfile]);

  // Listen to auth state changes - only run on mount
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
        if (import.meta.env.DEV) {
          console.error("getSession error:", e);
        }
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null;
      setUser(newUser);

      // Reset profile state when user changes
      if (newUser?.id !== currentUserId.current) {
        profileFetched.current = false;
        if (newUser) {
          fetchProfile(newUser.id);
        } else {
          setProfile(null);
          currentUserId.current = null;
        }
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign in
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  // Sign up
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { error };
  };

  // Sign out
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileFetched.current = false;
    currentUserId.current = null;
  };

  // Check if user can use feature
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

  // Record usage
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

  // Get remaining usage count
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
    refreshProfile,
  };
}
