-- 订阅系统数据库更新脚本
-- 在 Supabase Dashboard -> SQL Editor 中运行此脚本

-- ============================================
-- 1. 更新 profiles 表，添加订阅相关字段
-- ============================================

-- 添加钻石余额
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS diamonds INTEGER DEFAULT 0;

-- 添加订阅类型 (null=无订阅, 'basic'=普通, 'premium'=高级)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT NULL;

-- 添加订阅到期时间
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 添加试用期到期时间（新用户注册时设置为 now() + 1 day）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================
-- 2. 创建订阅套餐配置表
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('basic', 'premium')),
  duration_days INTEGER NOT NULL,
  duration_label TEXT NOT NULL,  -- 显示名称：1周、1月、3月、12月
  price_diamonds INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入套餐数据
INSERT INTO subscription_plans (type, duration_days, duration_label, price_diamonds) VALUES
  ('basic', 7, '1周', 199),
  ('basic', 30, '1月', 469),
  ('basic', 90, '3月', 1099),
  ('basic', 365, '12月', 3999),
  ('premium', 7, '1周', 299),
  ('premium', 30, '1月', 699),
  ('premium', 90, '3月', 1549),
  ('premium', 365, '12月', 5399)
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. 创建钻石交易记录表
-- ============================================

CREATE TABLE IF NOT EXISTS diamond_transactions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,  -- 正数=充值，负数=消费
  type TEXT NOT NULL CHECK (type IN ('recharge', 'subscribe', 'refund', 'gift')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_user_id ON diamond_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_diamond_transactions_created_at ON diamond_transactions(created_at);

-- ============================================
-- 4. 创建订阅记录表
-- ============================================

CREATE TABLE IF NOT EXISTS subscription_history (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
  price_paid INTEGER NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_user_id ON subscription_history(user_id);

-- ============================================
-- 5. 更新新用户触发器，设置试用期
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    is_subscribed, 
    is_admin,
    daily_usage, 
    last_usage_date,
    diamonds,
    subscription_type,
    subscription_expires_at,
    trial_expires_at
  )
  VALUES (
    NEW.id, 
    NEW.email, 
    FALSE, 
    FALSE,
    0, 
    CURRENT_DATE,
    0,
    NULL,
    NULL,
    NOW() + INTERVAL '1 day'  -- 1天试用期
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. 创建购买订阅的函数
-- ============================================

CREATE OR REPLACE FUNCTION purchase_subscription(
  p_user_id UUID,
  p_plan_id INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_plan subscription_plans%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_new_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
  -- 获取套餐信息
  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '套餐不存在');
  END IF;
  
  -- 获取用户信息
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '用户不存在');
  END IF;
  
  -- 检查钻石余额
  IF v_profile.diamonds < v_plan.price_diamonds THEN
    RETURN json_build_object('success', false, 'error', '钻石不足', 'required', v_plan.price_diamonds, 'current', v_profile.diamonds);
  END IF;
  
  -- 计算新的到期时间
  -- 如果当前订阅未过期且类型相同，则在现有基础上延长
  -- 否则从现在开始计算
  IF v_profile.subscription_expires_at IS NOT NULL 
     AND v_profile.subscription_expires_at > NOW() 
     AND v_profile.subscription_type = v_plan.type THEN
    v_new_expires_at := v_profile.subscription_expires_at + (v_plan.duration_days || ' days')::INTERVAL;
  ELSE
    v_new_expires_at := NOW() + (v_plan.duration_days || ' days')::INTERVAL;
  END IF;
  
  -- 扣除钻石
  UPDATE profiles SET 
    diamonds = diamonds - v_plan.price_diamonds,
    subscription_type = v_plan.type,
    subscription_expires_at = v_new_expires_at,
    updated_at = NOW()
  WHERE id = p_user_id;
  
  -- 记录钻石消费
  INSERT INTO diamond_transactions (user_id, amount, type, description)
  VALUES (p_user_id, -v_plan.price_diamonds, 'subscribe', 
          '购买' || v_plan.type || '订阅 ' || v_plan.duration_label);
  
  -- 记录订阅历史
  INSERT INTO subscription_history (user_id, plan_id, price_paid, expires_at)
  VALUES (p_user_id, p_plan_id, v_plan.price_diamonds, v_new_expires_at);
  
  RETURN json_build_object(
    'success', true, 
    'expires_at', v_new_expires_at,
    'subscription_type', v_plan.type,
    'diamonds_remaining', v_profile.diamonds - v_plan.price_diamonds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. 创建充值钻石的函数（管理员用）
-- ============================================

CREATE OR REPLACE FUNCTION admin_recharge_diamonds(
  p_admin_id UUID,
  p_target_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT '管理员充值'
)
RETURNS JSON AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- 检查是否是管理员
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = p_admin_id;
  IF NOT v_is_admin THEN
    RETURN json_build_object('success', false, 'error', '无权限');
  END IF;
  
  -- 充值
  UPDATE profiles SET 
    diamonds = diamonds + p_amount,
    updated_at = NOW()
  WHERE id = p_target_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '用户不存在');
  END IF;
  
  -- 记录交易
  INSERT INTO diamond_transactions (user_id, amount, type, description)
  VALUES (p_target_user_id, p_amount, 'recharge', p_description);
  
  RETURN json_build_object('success', true, 'amount', p_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. RLS 策略
-- ============================================

-- subscription_plans 所有人可读
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans" ON subscription_plans FOR SELECT USING (true);

-- diamond_transactions 用户只能看自己的
ALTER TABLE diamond_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" ON diamond_transactions 
  FOR SELECT USING (auth.uid() = user_id);

-- subscription_history 用户只能看自己的
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own history" ON subscription_history 
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 9. 给现有用户设置试用期（可选，运行一次）
-- ============================================

-- 给所有没有试用期的现有用户设置1天试用期
-- UPDATE profiles SET trial_expires_at = NOW() + INTERVAL '1 day' 
-- WHERE trial_expires_at IS NULL;

