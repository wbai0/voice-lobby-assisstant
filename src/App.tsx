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
  Tag,
  Space,
  Button,
  message,
  notification,
} from "antd";
import {
  SettingOutlined,
  LogoutOutlined,
  CrownOutlined,
  CloudDownloadOutlined,
} from "@ant-design/icons";
import { useAuth } from "./useAuth";
import { useUpdater } from "./useUpdater";
import { FREE_DAILY_LIMIT } from "./supabase";
import { autoMessageApi, logsApi } from "./api";
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
  const {
    profile,
    signOut,
    canUseFeature,
    recordUsage,
    getRemainingUsage,
    refreshProfile,
  } = useAuth();
  const updater = useUpdater();
  const connected = useConnectionStatus();

  const [showSettings, setShowSettings] = useState(false);
  const [items, setItems] = useState<ContentItemWithId[]>([]);
  const [maxUsers, setMaxUsers] = useState(10);
  const [delay, setDelay] = useState(5);

  const remainingUsage = getRemainingUsage();
  const isSubscribed = profile?.is_subscribed ?? false;

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
      const { allowed, reason } = canUseFeature();
      if (!allowed) throw new Error(reason);
      const { success } = await recordUsage();
      if (success) await refreshProfile();
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

  return (
    <Layout className="app-layout">
      {contextHolder}
      {notificationContextHolder}

      <Sidebar
        onRoomSelect={() => {}}
        onUserChat={() => {}}
        onUserProfile={() => {}}
        onAddUser={() => {}}
      />

      <Content className="app-content">
        <Flex vertical gap={12} className="main-container">
          {/* Header */}
          <Flex justify="space-between" align="center">
            <Flex align="center" gap={8}>
              <Text strong className="text-lg">
                Pico
              </Text>
              {isSubscribed ? (
                <Tag
                  color="gold"
                  icon={<CrownOutlined />}
                  className="tag-no-margin"
                >
                  会员
                </Tag>
              ) : (
                <Tag className="tag-no-margin">
                  {remainingUsage}/{FREE_DAILY_LIMIT}
                </Tag>
              )}
            </Flex>
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
            ocrInProgress={autoStatus?.data?.ocr_in_progress}
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
