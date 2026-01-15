import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
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
          // 注意：新用户会通过数据库触发器自动创建，这里是备用逻辑
          const today = new Date().toISOString().split("T")[0];
          const trialExpires = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString();
          const newProfile: Partial<UserProfile> = {
            id: userId,
            is_subscribed: false,
            is_admin: false,
            daily_usage: 0,
            last_usage_date: today,
            diamonds: 0,
            subscription_type: null,
            subscription_expires_at: null,
            trial_expires_at: trialExpires,
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

  return {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}
