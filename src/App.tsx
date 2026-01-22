import { useState, useEffect, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ConfigProvider,
  theme,
  App as AntApp,
  Layout,
  Flex,
  Typography,
  Button,
  message,
  notification,
  Tooltip,
} from "antd";
import {
  SettingOutlined,
  LogoutOutlined,
  CloudDownloadOutlined,
  TransactionOutlined,
  StarOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import { useAuth } from "./useAuth";
import { useSubscription } from "./useSubscription";
import { useUpdater } from "./useUpdater";
import { autoMessageApi, logsApi, adbApi } from "./api";
import {
  LoginForm,
  Sidebar,
  LogsSidebar,
  SettingsPanel,
  ConnectionModal,
  StatusBar,
  useConnectionStatus,
  MessageEditor,
  ControlPanel,
  SubscriptionPanel,
  getItemsForSubmit,
} from "./components";
import type { ContentItemWithId } from "./components";
import "./App.css";
import "./styles/shared.css";

const { Text } = Typography;
const { Content } = Layout;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: { colorPrimary: "#1677ff", borderRadius: 8 },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthWrapper />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

function AuthWrapper() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Layout className="app-layout">
        <Content className="loading-content">
          <Text type="secondary">加载中...</Text>
        </Content>
      </Layout>
    );
  }

  if (!user) return <LoginForm onSuccess={() => {}} />;
  return <MainApp />;
}

function MainApp() {
  const qc = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [notificationApi, notificationContextHolder] =
    notification.useNotification();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const subscription = useSubscription(profile, refreshProfile);
  const updater = useUpdater();
  const connected = useConnectionStatus();

  const [showConnection, setShowConnection] = useState(false);
  const [items, setItems] = useState<ContentItemWithId[]>([]);
  const [maxUsers, setMaxUsers] = useState(10);
  const [delay, setDelay] = useState(5);
  const [activePanel, setActivePanel] = useState<
    "favorites" | "logs" | "subscription" | "settings" | null
  >("favorites");
  const [sidebarWidth, setSidebarWidth] = useState(250);

  // Update notification
  useEffect(() => {
    if (updater.available && updater.version) {
      notificationApi.info({
        message: "发现新版本",
        description: `版本 ${updater.version} 可用`,
        btn: (
          <Button
            type="primary"
            size="small"
            icon={<CloudDownloadOutlined />}
            onClick={() => updater.downloadAndInstall()}
            loading={updater.downloading}
          >
            {updater.downloading ? `下载中 ${updater.progress}%` : "立即更新"}
          </Button>
        ),
        duration: 0,
        key: "update-notification",
      });
    }
  }, [updater.available, updater.version]);

  useEffect(() => {
    if (updater.error) {
      messageApi.error(`检查更新失败: ${updater.error}`);
    }
  }, [updater.error]);

  useEffect(() => {
    if (profile) logsApi.setAdmin(profile.is_admin ?? false);
  }, [profile]);

  // Auto status query
  const { data: autoStatus } = useQuery({
    queryKey: ["autoStatus"],
    queryFn: autoMessageApi.status,
    staleTime: 500,
    refetchInterval: (query) => (query.state.data?.data?.running ? 500 : 5000),
  });

  const isRunning = autoStatus?.data?.running ?? false;
  const processed = autoStatus?.data?.processed ?? 0;
  const total = autoStatus?.data?.total ?? 0;
  const hasContent = items.some(
    (i) => i.type === "photo" || (i.type === "text" && i.content.trim()),
  );

  const handleMessage = useCallback(
    (type: "success" | "error" | "warning", msg: string) => {
      messageApi[type](msg);
    },
    [messageApi],
  );

  const startAuto = useMutation({
    mutationFn: async () => {
      // 检查订阅状态
      const { allowed, reason } = subscription.canUseFeature();
      if (!allowed) throw new Error(reason);
      return autoMessageApi.start(getItemsForSubmit(items), maxUsers, delay);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autoStatus", "logs"] }),
    onError: (err: Error) => messageApi.error(err.message),
  });

  const stopAuto = useMutation({
    mutationFn: autoMessageApi.stop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autoStatus", "logs"] }),
    onError: (err: Error) => messageApi.error(`停止失败: ${err.message}`),
  });

  const testInChat = useMutation({
    mutationFn: () => autoMessageApi.testInChat(getItemsForSubmit(items)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("测试完成");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });

  // Sidebar 操作
  const openRoom = useMutation({
    mutationFn: (roomId: string) => adbApi.openRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已跳转");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });

  const openChat = useMutation({
    mutationFn: (uid: string) => adbApi.openChat(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已打开聊天");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });

  const openUser = useMutation({
    mutationFn: (uid: string) => adbApi.openUser(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已打开主页");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });

  return (
    <Layout className="app-layout" style={{ flexDirection: "row" }}>
      {contextHolder}
      {notificationContextHolder}

      {/* Activity Bar */}
      <div
        style={{
          width: 48,
          minWidth: 48,
          flexShrink: 0,
          background: "#f5f5f5",
          borderRight: "1px solid #e8e8e8",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tooltip title="收藏" placement="right">
            <Button
              type="text"
              icon={<StarOutlined />}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: activePanel === "favorites" ? "#e6f4ff" : undefined,
                color: activePanel === "favorites" ? "#1677ff" : undefined,
              }}
              onClick={() =>
                setActivePanel(activePanel === "favorites" ? null : "favorites")
              }
            />
          </Tooltip>
          <Tooltip title="日志" placement="right">
            <Button
              type="text"
              icon={<FileTextOutlined />}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: activePanel === "logs" ? "#e6f4ff" : undefined,
                color: activePanel === "logs" ? "#1677ff" : undefined,
              }}
              onClick={() =>
                setActivePanel(activePanel === "logs" ? null : "logs")
              }
            />
          </Tooltip>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Tooltip title="订阅管理" placement="right">
            <Button
              type="text"
              icon={<TransactionOutlined />}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background:
                  activePanel === "subscription" ? "#e6f4ff" : undefined,
                color: activePanel === "subscription" ? "#1677ff" : undefined,
              }}
              onClick={() => {
                setActivePanel(
                  activePanel === "subscription" ? null : "subscription",
                );
                refreshProfile();
              }}
            />
          </Tooltip>
          <Tooltip title="设置" placement="right">
            <Button
              type="text"
              icon={<SettingOutlined />}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: activePanel === "settings" ? "#e6f4ff" : undefined,
                color: activePanel === "settings" ? "#1677ff" : undefined,
              }}
              onClick={() =>
                setActivePanel(activePanel === "settings" ? null : "settings")
              }
            />
          </Tooltip>
        </div>
      </div>

      {/* Left Panel - Favorites */}
      {activePanel === "favorites" && (
        <Sidebar
          onRoomSelect={(roomId) => openRoom.mutate(roomId)}
          onUserChat={(uid) => openChat.mutate(uid)}
          onUserProfile={(uid) => openUser.mutate(uid)}
          canUseFavorites={subscription.canUseFeature().allowed}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}

      {/* Left Panel - Logs */}
      {activePanel === "logs" && (
        <LogsSidebar
          connected={connected}
          isRunning={isRunning}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}

      {/* Left Panel - Subscription */}
      {activePanel === "subscription" && (
        <SubscriptionPanel
          profile={profile}
          email={user?.email}
          status={subscription.status}
          plans={subscription.plans}
          formatRemaining={subscription.formatRemaining}
          onPurchase={subscription.purchaseSubscription}
          onMessage={handleMessage}
          onRefreshProfile={refreshProfile}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}

      {/* Left Panel - Settings */}
      {activePanel === "settings" && (
        <SettingsPanel
          onMessage={handleMessage}
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
        />
      )}

      <Content className="app-content" style={{ alignContent: "flex-start" }}>
        <Flex vertical gap={12} className="main-container">
          {/* Header */}
          <Flex justify="space-between" align="center">
            <Text strong className="text-lg">
              语音主播工具箱
            </Text>
            <Tooltip title="退出登录">
              <Button
                size="small"
                type="text"
                icon={<LogoutOutlined />}
                onClick={signOut}
              />
            </Tooltip>
          </Flex>

          {/* 订阅状态 - 简化版 */}
          <SubscriptionPanel
            profile={profile}
            email={user?.email}
            status={subscription.status}
            plans={subscription.plans}
            formatRemaining={subscription.formatRemaining}
            onPurchase={subscription.purchaseSubscription}
            onMessage={handleMessage}
            onRefreshProfile={refreshProfile}
            compact
          />

          <ConnectionModal
            open={showConnection}
            onClose={() => setShowConnection(false)}
            isRunning={isRunning}
            onMessage={handleMessage}
          />

          <MessageEditor
            isRunning={isRunning}
            onItemsChange={setItems}
            onMessage={handleMessage}
          />

          <ControlPanel
            maxUsers={maxUsers}
            delay={delay}
            isRunning={isRunning}
            connected={connected}
            hasContent={hasContent}
            processed={processed}
            total={total}
            uiDetectionInProgress={autoStatus?.data?.ui_detection_in_progress}
            onMaxUsersChange={setMaxUsers}
            onDelayChange={setDelay}
            onTest={() => testInChat.mutate()}
            onStart={() => startAuto.mutate()}
            onStop={() => stopAuto.mutate()}
            testLoading={testInChat.isPending}
            startLoading={startAuto.isPending}
          />
        </Flex>
      </Content>

      <StatusBar
        connected={connected}
        isRunning={isRunning}
        onOpenConnection={() => setShowConnection(true)}
        onDisconnect={() =>
          adbApi
            .disconnect()
            .then(() => qc.invalidateQueries({ queryKey: ["adb"] }))
        }
      />
    </Layout>
  );
}
