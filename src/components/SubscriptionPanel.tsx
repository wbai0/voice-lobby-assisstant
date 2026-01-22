import { useState, useRef, useEffect } from "react";
import {
  Card,
  Flex,
  Typography,
  Tag,
  Button,
  Modal,
  Space,
  Statistic,
  Layout,
} from "antd";
import {
  CrownOutlined,
  GoldOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import type { UserProfile, SubscriptionPlan } from "../supabase";
import type { SubscriptionStatus } from "../useSubscription";
import "./SubscriptionPanel.css";

const { Sider } = Layout;
const { Text } = Typography;
const { confirm } = Modal;

interface SubscriptionPanelProps {
  profile: UserProfile | null;
  email?: string | null;
  status: SubscriptionStatus;
  plans: SubscriptionPlan[];
  formatRemaining: (ms: number | null) => string;
  onPurchase: (planId: number) => Promise<{ success: boolean; error?: string }>;
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
  onRefreshProfile?: () => Promise<void>;
  compact?: boolean;
  width?: number;
  onWidthChange?: (w: number) => void;
}

export function SubscriptionPanel({
  profile,
  email,
  status,
  plans,
  formatRemaining,
  onPurchase,
  onMessage,
  onRefreshProfile,
  compact = false,
  width = 250,
  onWidthChange,
}: SubscriptionPanelProps) {
  const [refreshing, setRefreshing] = useState(false);

  // Resize logic
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  useEffect(() => {
    if (compact) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(200, Math.min(500, startWidth.current + delta));
      onWidthChange?.(newWidth);
    };
    const onMouseUp = () => {
      isResizing.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onWidthChange, compact]);

  const handlePurchase = async (plan: SubscriptionPlan) => {
    const diamonds = profile?.diamonds ?? 0;
    if (diamonds < plan.price_diamonds) {
      onMessage("warning", "钻石余额不足，请先充值");
      return;
    }

    confirm({
      title: "确认购买",
      icon: <ExclamationCircleOutlined />,
      content: (
        <Flex vertical gap={8}>
          <Text>套餐：{plan.duration_label}</Text>
          <Text>
            价格：
            <Text strong style={{ color: "#1890ff" }}>
              {plan.price_diamonds}
            </Text>{" "}
            钻石
          </Text>
          <Text type="secondary">
            购买后剩余：{diamonds - plan.price_diamonds} 钻石
          </Text>
        </Flex>
      ),
      okText: "确认购买",
      cancelText: "取消",
      onOk: async () => {
        const result = await onPurchase(plan.id);
        if (result.success) {
          onMessage("success", "订阅成功！");
        } else {
          onMessage("error", result.error || "购买失败");
        }
      },
    });
  };

  const filteredPlans = plans.filter((p) => p.type === "basic");

  const renderStatusTag = () => {
    if (profile?.is_admin) {
      return (
        <Tag color="gold" icon={<CrownOutlined />}>
          管理员
        </Tag>
      );
    }
    if (status.inTrial) return <Tag color="blue">试用中</Tag>;
    if (status.isActive) return <Tag color="green">已订阅</Tag>;
    return <Tag color="red">已过期</Tag>;
  };

  const getAvatarLetter = () => {
    if (!email) return "?";
    return email.charAt(0).toUpperCase();
  };

  // Compact mode - just the status card
  if (compact) {
    return (
      <Card size="small" className="subscription-card">
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={12}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #1677ff 0%, #69b1ff 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 600,
                fontSize: 16,
              }}
            >
              {getAvatarLetter()}
            </div>
            <Flex vertical gap={2}>
              <Flex align="center" gap={8}>
                <Text strong>{email}</Text>
                {renderStatusTag()}
              </Flex>
              {status.expiresAt && !profile?.is_admin && (
                <Text type="secondary" className="text-xs">
                  {status.inTrial ? "试用" : ""}剩余{" "}
                  {formatRemaining(
                    status.inTrial
                      ? status.trialRemaining
                      : status.subscriptionRemaining,
                  )}
                </Text>
              )}
            </Flex>
          </Flex>
          <Button
            size="small"
            loading={refreshing}
            onClick={async () => {
              if (onRefreshProfile) {
                setRefreshing(true);
                await onRefreshProfile();
                setRefreshing(false);
                onMessage("success", "账户已刷新");
              }
            }}
          >
            刷新账户
          </Button>
        </Flex>
      </Card>
    );
  }

  // Sidebar mode - full subscription panel
  return (
    <Sider width={width} theme="light" className="subscription-sider">
      <div className="subscription-content">
        <Text
          strong
          style={{ fontSize: 14, marginBottom: 16, display: "block" }}
        >
          订阅服务
        </Text>

        <Flex vertical gap={16}>
          <Card size="small" className="diamond-balance-card">
            <Statistic
              title="钻石余额"
              value={profile?.diamonds ?? 0}
              prefix={<GoldOutlined />}
              valueStyle={{ color: "#1890ff" }}
            />
            <Text type="secondary" className="text-xs">
              充值请联系客服
            </Text>
          </Card>

          <Card size="small" className="feature-card">
            <Text strong>订阅功能：</Text>
            <ul className="feature-list">
              <li>✓ 给单一 ID 发送消息</li>
              <li>✓ 自动发送功能</li>
              <li>✓ 收藏用户管理</li>
              <li>✓ 收藏房间管理</li>
            </ul>
          </Card>

          <Space direction="vertical" className="w-full">
            {filteredPlans.map((plan) => {
              const canAfford = (profile?.diamonds ?? 0) >= plan.price_diamonds;
              return (
                <Card
                  key={plan.id}
                  size="small"
                  className={`plan-card ${
                    canAfford ? "plan-card-affordable" : "plan-card-disabled"
                  }`}
                  hoverable={canAfford}
                  onClick={() => canAfford && handlePurchase(plan)}
                  style={{ cursor: canAfford ? "pointer" : "not-allowed" }}
                >
                  <Flex justify="space-between" align="center">
                    <Flex vertical>
                      <Text strong>{plan.duration_label}</Text>
                      <Text type="secondary" className="text-xs">
                        {plan.duration_days}天
                      </Text>
                    </Flex>
                    <Flex align="center" gap={8}>
                      <Text
                        strong
                        style={{
                          color: canAfford ? "#1890ff" : "#999",
                          fontSize: 18,
                        }}
                      >
                        <GoldOutlined /> {plan.price_diamonds}
                      </Text>
                      {!canAfford && <Tag color="default">余额不足</Tag>}
                    </Flex>
                  </Flex>
                </Card>
              );
            })}
          </Space>
        </Flex>
      </div>

      <div
        className="resize-handle-right"
        onMouseDown={(e) => {
          isResizing.current = true;
          startX.current = e.clientX;
          startWidth.current = width;
        }}
      />
    </Sider>
  );
}
