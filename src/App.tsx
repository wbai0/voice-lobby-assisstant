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
  Space,
  Button,
  message,
  notification,
} from "antd";
import {
  SettingOutlined,
  LogoutOutlined,
  CloudDownloadOutlined,
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
  ConnectionCard,
  useConnectionStatus,
  MessageEditor,
  ControlPanel,
  NavigationCards,
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
  const { profile, signOut, refreshProfile } = useAuth();
  const subscription = useSubscription(profile, refreshProfile);
  const updater = useUpdater();
  const connected = useConnectionStatus();

  const [showSettings, setShowSettings] = useState(false);
  const [items, setItems] = useState<ContentItemWithId[]>([]);
  const [maxUsers, setMaxUsers] = useState(10);
  const [delay, setDelay] = useState(5);

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
    (i) => i.type === "photo" || (i.type === "text" && i.content.trim())
  );

  const handleMessage = useCallback(
    (type: "success" | "error" | "warning", msg: string) => {
      messageApi[type](msg);
    },
    [messageApi]
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
    <Layout className="app-layout">
      {contextHolder}
      {notificationContextHolder}

      <Sidebar
        onRoomSelect={(roomId) => openRoom.mutate(roomId)}
        onUserChat={(uid) => openChat.mutate(uid)}
        onUserProfile={(uid) => openUser.mutate(uid)}
        onAddUser={() => {}}
        canUseFavorites={subscription.canUseFeature().allowed}
      />

      <Content className="app-content">
        <Flex vertical gap={12} className="main-container">
          {/* Header */}
          <Flex justify="space-between" align="center">
            <Text strong className="text-lg">
              Pico
            </Text>
            <Space size={4}>
              <Button
                size="small"
                type="text"
                icon={<SettingOutlined />}
                onClick={() => setShowSettings(!showSettings)}
                aria-label="设置"
              />
              <Button
                size="small"
                type="text"
                icon={<LogoutOutlined />}
                onClick={signOut}
                aria-label="退出登录"
              />
            </Space>
          </Flex>

          {/* 订阅状态 */}
          <SubscriptionPanel
            profile={profile}
            status={subscription.status}
            plans={subscription.plans}
            formatRemaining={subscription.formatRemaining}
            onPurchase={subscription.purchaseSubscription}
            onMessage={handleMessage}
          />

          {showSettings && <SettingsPanel onMessage={handleMessage} />}

          <ConnectionCard isRunning={isRunning} onMessage={handleMessage} />

          <NavigationCards
            connected={connected}
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

      <LogsSidebar connected={connected} isRunning={isRunning} />
    </Layout>
  );
}
