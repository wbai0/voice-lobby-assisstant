import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, SUBSCRIPTION_CHECK_INTERVAL } from "./supabase";
import type { UserProfile, SubscriptionPlan } from "./supabase";

export interface SubscriptionStatus {
  // 是否有效（试用中或已订阅）
  isActive: boolean;
  // 是否在试用期
  inTrial: boolean;
  // 试用期剩余时间（毫秒）
  trialRemaining: number | null;
  // 订阅剩余时间（毫秒）
  subscriptionRemaining: number | null;
  // 到期时间
  expiresAt: Date | null;
  // 是否已过期
  expired: boolean;
}

/**
 * 计算用户的订阅状态
 */
export function calculateSubscriptionStatus(
  profile: UserProfile | null
): SubscriptionStatus {
  if (!profile) {
    return {
      isActive: false,
      inTrial: false,
      trialRemaining: null,
      subscriptionRemaining: null,
      expiresAt: null,
      expired: true,
    };
  }

  // 管理员永远有效
  if (profile.is_admin) {
    return {
      isActive: true,
      inTrial: false,
      trialRemaining: null,
      subscriptionRemaining: null,
      expiresAt: null,
      expired: false,
    };
  }

  const now = Date.now();

  // 检查试用期
  if (profile.trial_expires_at) {
    const trialExpires = new Date(profile.trial_expires_at).getTime();
    if (trialExpires > now) {
      return {
        isActive: true,
        inTrial: true,
        trialRemaining: trialExpires - now,
        subscriptionRemaining: null,
        expiresAt: new Date(trialExpires),
        expired: false,
      };
    }
  }

  // 检查订阅
  if (profile.subscription_expires_at) {
    const subExpires = new Date(profile.subscription_expires_at).getTime();
    if (subExpires > now) {
      return {
        isActive: true,
        inTrial: false,
        trialRemaining: null,
        subscriptionRemaining: subExpires - now,
        expiresAt: new Date(subExpires),
        expired: false,
      };
    }
  }

  // 已过期
  return {
    isActive: false,
    inTrial: false,
    trialRemaining: null,
    subscriptionRemaining: null,
    expiresAt: null,
    expired: true,
  };
}

/**
 * 检查是否可以使用功能（简化版：只要订阅有效就可以）
 */
export function canUseFeature(status: SubscriptionStatus): {
  allowed: boolean;
  reason?: string;
} {
  if (status.expired) {
    return {
      allowed: false,
      reason: "订阅已过期，请续费后继续使用",
    };
  }
  return { allowed: true };
}

/**
 * 订阅管理 Hook
 */
export function useSubscription(
  profile: UserProfile | null,
  refreshProfile: () => Promise<void>
) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const checkIntervalRef = useRef<number | null>(null);

  // 计算当前订阅状态
  const status = calculateSubscriptionStatus(profile);

  // 获取订阅套餐列表
  const fetchPlans = useCallback(async () => {
    const { data, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .order("type")
      .order("duration_days");

    if (!error && data) {
      setPlans(data);
    }
  }, []);

  // 购买订阅
  const purchaseSubscription = useCallback(
    async (planId: number): Promise<{ success: boolean; error?: string }> => {
      if (!profile) {
        return { success: false, error: "请先登录" };
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("purchase_subscription", {
          p_user_id: profile.id,
          p_plan_id: planId,
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (!data.success) {
          return { success: false, error: data.error };
        }

        // 刷新用户信息
        await refreshProfile();
        return { success: true };
      } catch (e) {
        return {
          success: false,
          error: e instanceof Error ? e.message : "购买失败",
        };
      } finally {
        setLoading(false);
      }
    },
    [profile, refreshProfile]
  );

  // 定期校验订阅状态
  useEffect(() => {
    if (!profile) return;

    // 立即获取套餐列表
    fetchPlans();

    // 设置定期校验
    checkIntervalRef.current = window.setInterval(() => {
      refreshProfile();
    }, SUBSCRIPTION_CHECK_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [profile?.id, fetchPlans, refreshProfile]);

  // 格式化剩余时间
  const formatRemaining = useCallback((ms: number | null): string => {
    if (ms === null) return "";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}天${hours % 24}小时`;
    }
    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`;
    }
    if (minutes > 0) {
      return `${minutes}分钟`;
    }
    return "即将到期";
  }, []);

  return {
    status,
    plans,
    loading,
    purchaseSubscription,
    formatRemaining,
    canUseFeature: () => canUseFeature(status),
  };
}
