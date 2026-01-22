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
          // Profile doesn't exist, create one with trial
          const trialExpires = new Date(
            Date.now() + 24 * 60 * 60 * 1000,
          ).toISOString();
          const newProfile: Partial<UserProfile> = {
            id: userId,
            is_admin: false,
            diamonds: 0,
            subscription_type: "trial",
            subscription_expires_at: trialExpires,
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

  // Send OTP to email (works for both new and existing users)
  const sendOtp = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true, // Auto-create user if doesn't exist
      },
    });
    return { error };
  };

  // Verify OTP and sign in
  const verifyOtp = async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "magiclink", // Must match the type sent by signInWithOtp
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
    sendOtp,
    verifyOtp,
    signOut,
    refreshProfile,
  };
}
