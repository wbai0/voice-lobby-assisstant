import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ConfigProvider, theme, App as AntApp, Layout, Flex } from "antd";
import {
  Button,
  Card,
  Select,
  Input,
  InputNumber,
  Progress,
  Space,
  Typography,
  Tag,
  Dropdown,
  message,
  Popconfirm,
  Form,
  Slider,
  Modal,
  notification,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PlusOutlined,
  SettingOutlined,
  LinkOutlined,
  DisconnectOutlined,
  ThunderboltOutlined,
  PictureOutlined,
  SaveOutlined,
  UserOutlined,
  HolderOutlined,
  LockOutlined,
  LogoutOutlined,
  CrownOutlined,
  DownOutlined,
  ClearOutlined,
  HomeOutlined,
  StarOutlined,
  StarFilled,
  SearchOutlined,
  CloudDownloadOutlined,
} from "@ant-design/icons";
import { useAuth } from "./useAuth";
import { useUpdater } from "./useUpdater";
import { FREE_DAILY_LIMIT } from "./supabase";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { nanoid } from "nanoid";
import { adbApi, logsApi, autoMessageApi } from "./api";

const { Text } = Typography;
const { Content, Sider } = Layout;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

type ContentItem =
  | { type: "text"; content: string }
  | { type: "photo"; index: number };
interface Template {
  name: string;
  items: ContentItem[];
}

const TEMPLATES_KEY = "pico_templates_v2";
const DEFAULT_TEMPLATE_KEY = "pico_default_template";
const FAVORITE_ROOMS_KEY = "pico_favorite_rooms";
const FAVORITE_USERS_KEY = "pico_favorite_users";
const SIDEBAR_SPLIT_KEY = "pico_sidebar_split";

interface FavoriteRoom {
  id: string;
  name: string;
}

interface FavoriteUser {
  id: string;
  name: string;
}

type ContentItemWithId = ContentItem & { id: string };

const withIds = (items: ContentItem[]): ContentItemWithId[] =>
  items.map((item) => ({ ...item, id: nanoid() }));

// 可拖拽的消息项
function SortableMessageItem({
  item,
  isRunning,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: ContentItemWithId;
  isRunning: boolean;
  onUpdate: (data: Partial<ContentItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isRunning });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Flex
        align="center"
        gap={8}
        style={{
          padding: "8px 12px",
          background: isDragging ? "rgba(22, 119, 255, 0.05)" : "#fafafa",
          borderRadius: 8,
          marginBottom: 8,
          border: isDragging ? "1px dashed #1677ff" : "1px solid #f0f0f0",
        }}
      >
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: isRunning ? "not-allowed" : "grab" }}
        >
          <HolderOutlined style={{ color: "#bfbfbf" }} />
        </div>
        <div style={{ flex: 1 }}>
          {item.type === "text" ? (
            <Input.TextArea
              placeholder="输入消息..."
              value={item.content}
              onChange={(e) => onUpdate({ content: e.target.value })}
              disabled={isRunning}
              rows={1}
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ width: "100%" }}
            />
          ) : (
            <Flex align="center" gap={8}>
              <PictureOutlined style={{ color: "#faad14" }} />
              <Text type="secondary">第</Text>
              <InputNumber
                min={1}
                max={20}
                value={item.index}
                onChange={(v) => onUpdate({ index: v || 1 })}
                disabled={isRunning}
                size="small"
                style={{ width: 50 }}
              />
              <Text type="secondary">张图</Text>
            </Flex>
          )}
        </div>
        {canRemove && (
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            disabled={isRunning}
            onClick={onRemove}
          />
        )}
      </Flex>
    </div>
  );
}

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

// 登录表单
function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const { signIn, signUp } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    const { error } = isRegister
      ? await signUp(values.email, values.password)
      : await signIn(values.email, values.password);
    setLoading(false);

    if (error) {
      messageApi.error(error.message);
    } else if (isRegister) {
      messageApi.success("注册成功，请查收验证邮件");
    } else {
      messageApi.success("登录成功");
      onSuccess();
    }
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      {contextHolder}
      <Content
        style={{
          padding: 16,
          maxWidth: 360,
          margin: "auto",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Card style={{ width: "100%" }}>
          <Flex vertical gap={16} align="center">
            <Text strong style={{ fontSize: 20 }}>
              Pico Assistant
            </Text>
            <Form
              form={form}
              onFinish={handleSubmit}
              style={{ width: "100%" }}
              layout="vertical"
            >
              <Form.Item
                name="email"
                rules={[
                  { required: true, type: "email", message: "请输入有效邮箱" },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="邮箱"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[{ required: true, min: 6, message: "密码至少6位" }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  {isRegister ? "注册" : "登录"}
                </Button>
              </Form.Item>
            </Form>
            <Button type="link" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? "已有账号？去登录" : "没有账号？去注册"}
            </Button>
          </Flex>
        </Card>
      </Content>
    </Layout>
  );
}

function AuthWrapper() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
        <Content
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text type="secondary">加载中...</Text>
        </Content>
      </Layout>
    );
  if (!user) return <LoginForm onSuccess={() => {}} />;
  return <MainApp />;
}

function MainApp() {
  const qc = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const [notificationApi, notificationContextHolder] =
    notification.useNotification();
  const { profile, signOut, canUseFeature, recordUsage, getRemainingUsage } =
    useAuth();
  const updater = useUpdater();
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [items, setItems] = useState<ContentItemWithId[]>(() =>
    withIds([{ type: "text", content: "" }])
  );
  const [maxUsers, setMaxUsers] = useState(10);
  const [delay, setDelay] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [customAdbPath, setCustomAdbPath] = useState("");
  const [roomId, setRoomId] = useState("");
  const [userId, setUserId] = useState("");
  const [favoriteRooms, setFavoriteRooms] = useState<FavoriteRoom[]>([]);
  const [favoriteUsers, setFavoriteUsers] = useState<FavoriteUser[]>([]);
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [favoriteRoomName, setFavoriteRoomName] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [sidebarSplit, setSidebarSplit] = useState(50); // 百分比
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [searchText, setSearchText] = useState(""); // 搜索关键词
  const [debugRoute, setDebugRoute] = useState<string>(""); // 调试路由
  const [debugParams, setDebugParams] = useState(""); // 调试参数
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [defaultTemplate, setDefaultTemplate] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);

  const remainingUsage = getRemainingUsage();
  const isSubscribed = profile?.is_subscribed ?? false;

  // Show update notification when available
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
    if (profile) logsApi.setAdmin(profile.is_admin ?? false);
  }, [profile]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem(TEMPLATES_KEY);
    const defaultName = localStorage.getItem(DEFAULT_TEMPLATE_KEY) || "";
    const savedRooms = localStorage.getItem(FAVORITE_ROOMS_KEY);
    const savedUsers = localStorage.getItem(FAVORITE_USERS_KEY);
    const savedSplit = localStorage.getItem(SIDEBAR_SPLIT_KEY);
    setDefaultTemplate(defaultName);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Template[];
        setTemplates(parsed);
        if (defaultName) {
          const t = parsed.find((t) => t.name === defaultName);
          if (t) {
            setItems(withIds(t.items));
            setSelectedTemplate(defaultName);
          }
        }
      } catch {}
    }
    if (savedRooms) {
      try {
        setFavoriteRooms(JSON.parse(savedRooms));
      } catch {}
    }
    if (savedUsers) {
      try {
        setFavoriteUsers(JSON.parse(savedUsers));
      } catch {}
    }
    if (savedSplit) {
      setSidebarSplit(Number(savedSplit) || 50);
    }
  }, []);

  const saveTemplates = (t: Template[]) => {
    setTemplates(t);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
  };
  const saveFavoriteRooms = (rooms: FavoriteRoom[]) => {
    console.log("Saving favorite rooms:", rooms);
    setFavoriteRooms(rooms);
    localStorage.setItem(FAVORITE_ROOMS_KEY, JSON.stringify(rooms));
  };
  const addFavoriteRoom = () => {
    console.log("addFavoriteRoom called, roomId:", roomId);
    if (!roomId.trim()) {
      messageApi.warning("请先输入房间 ID");
      return;
    }
    if (favoriteRooms.some((r) => r.id === roomId)) {
      messageApi.warning("该房间已收藏");
      return;
    }
    setFavoriteRoomName(`房间${roomId}`);
    setShowFavoriteModal(true);
  };
  const confirmAddFavorite = () => {
    if (!favoriteRoomName.trim()) {
      messageApi.warning("请输入房间名称");
      return;
    }
    saveFavoriteRooms([
      ...favoriteRooms,
      { id: roomId, name: favoriteRoomName },
    ]);
    messageApi.success(`已收藏: ${favoriteRoomName}`);
    setShowFavoriteModal(false);
    setFavoriteRoomName("");
  };
  const removeFavoriteRoom = (id: string) => {
    saveFavoriteRooms(favoriteRooms.filter((r) => r.id !== id));
  };

  // 用户收藏相关
  const saveFavoriteUsers = (users: FavoriteUser[]) => {
    setFavoriteUsers(users);
    localStorage.setItem(FAVORITE_USERS_KEY, JSON.stringify(users));
  };
  const addFavoriteUser = () => {
    setNewUserId("");
    setNewUserName("");
    setShowUserModal(true);
  };
  const confirmAddUser = () => {
    if (!newUserId.trim()) {
      messageApi.warning("请输入用户 ID");
      return;
    }
    if (!newUserName.trim()) {
      messageApi.warning("请输入用户名称");
      return;
    }
    if (favoriteUsers.some((u) => u.id === newUserId)) {
      messageApi.warning("该用户已收藏");
      return;
    }
    saveFavoriteUsers([...favoriteUsers, { id: newUserId, name: newUserName }]);
    messageApi.success(`已收藏用户: ${newUserName}`);
    setShowUserModal(false);
  };
  const removeFavoriteUser = (id: string) => {
    saveFavoriteUsers(favoriteUsers.filter((u) => u.id !== id));
  };

  // 拖拽分割条
  const handleSplitDrag = (e: React.MouseEvent) => {
    if (!sidebarRef.current) return;
    const rect = sidebarRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percent = Math.min(Math.max((y / rect.height) * 100, 20), 80);
    setSidebarSplit(percent);
  };
  const handleSplitDragEnd = () => {
    setIsDraggingSplit(false);
    localStorage.setItem(SIDEBAR_SPLIT_KEY, String(sidebarSplit));
  };

  const setAsDefault = (name: string) => {
    setDefaultTemplate(name);
    localStorage.setItem(DEFAULT_TEMPLATE_KEY, name);
    messageApi.success(`默认: ${name}`);
  };
  const saveAsNewTemplate = () => {
    const name = prompt("模板名称", `模板${templates.length + 1}`);
    if (!name) return;
    saveTemplates([
      ...templates.filter((t) => t.name !== name),
      { name, items: [...items] },
    ]);
    setSelectedTemplate(name);
  };
  const loadTemplate = (name: string) => {
    const t = templates.find((t) => t.name === name);
    if (t) {
      setItems(withIds(t.items));
      setSelectedTemplate(name);
    }
  };
  const deleteTemplate = (name: string) => {
    saveTemplates(templates.filter((t) => t.name !== name));
    if (selectedTemplate === name) setSelectedTemplate("");
  };
  const addItem = (type: "text" | "photo") =>
    setItems([
      ...items,
      type === "text"
        ? { type: "text", content: "", id: nanoid() }
        : { type: "photo", index: 1, id: nanoid() },
    ]);
  const removeItem = (id: string) => {
    if (items.length > 1) setItems(items.filter((item) => item.id !== id));
  };
  const updateItem = (id: string, data: Partial<ContentItem>) =>
    setItems(
      items.map((item) =>
        item.id === id ? ({ ...item, ...data } as ContentItemWithId) : item
      )
    );

  const { data: adbStatus } = useQuery({
    queryKey: ["adb"],
    queryFn: adbApi.status,
    staleTime: 10000,
  });
  const { data: adbInfo } = useQuery({
    queryKey: ["adbInfo"],
    queryFn: adbApi.getInfo,
    staleTime: 30000,
  });
  const { data: instances, refetch: refetchInstances } = useQuery({
    queryKey: ["instances"],
    queryFn: adbApi.instances,
    staleTime: 10000,
  });
  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: () => logsApi.get(50),
    staleTime: 1000,
    refetchInterval: 1000,
  });
  const { data: autoStatus } = useQuery({
    queryKey: ["autoStatus"],
    queryFn: autoMessageApi.status,
    staleTime: 500,
    refetchInterval: (query) => (query.state.data?.data?.running ? 500 : 3000),
  });

  // 自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs?.data?.logs]);

  const adbConnect = useMutation({
    mutationFn: (port: number) => adbApi.connect(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adb"] });
      messageApi.success("已连接");
    },
    onError: () => messageApi.error("连接失败"),
  });
  const adbDisconnect = useMutation({
    mutationFn: adbApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adb"] }),
  });
  const startAuto = useMutation({
    mutationFn: async () => {
      const { allowed, reason } = canUseFeature();
      if (!allowed) throw new Error(reason);
      await recordUsage();
      return autoMessageApi.start(
        items.map(({ id, ...rest }) => rest),
        maxUsers,
        delay
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autoStatus", "logs"] }),
    onError: (err: Error) => messageApi.error(err.message),
  });
  const stopAuto = useMutation({
    mutationFn: autoMessageApi.stop,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autoStatus", "logs"] }),
  });
  const clearLogs = useMutation({
    mutationFn: logsApi.clear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
  });
  const testInChat = useMutation({
    mutationFn: () =>
      autoMessageApi.testInChat(items.map(({ id, ...rest }) => rest)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("测试完成");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });
  const setAdbPath = useMutation({
    mutationFn: (path: string) => adbApi.setPath(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adbInfo"] });
      messageApi.success("已设置");
    },
  });
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
  const openRoute = useMutation({
    mutationFn: (route: string) => adbApi.openRoute(route),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已执行");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });
  const tapMeTab = useMutation({
    mutationFn: () => adbApi.tapMeTab(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已点击「我的」Tab");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });
  const tapNovaUserList = useMutation({
    mutationFn: () => adbApi.tapNovaUserList(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已点击「新星用户榜」");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });
  const navigateToNovaList = useMutation({
    mutationFn: () => adbApi.navigateToNovaList(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      messageApi.success("已导航到「新星用户榜」");
    },
    onError: (err: Error) => messageApi.error(err.message),
  });

  const connected = adbStatus?.data?.connected ?? false;
  const runningInstances = instances?.data?.filter((i) => i.running) ?? [];
  const isRunning = autoStatus?.data?.running ?? false;
  const processed = autoStatus?.data?.processed ?? 0;
  const total = autoStatus?.data?.total ?? 0;
  const hasContent = items.some(
    (i) => i.type === "photo" || (i.type === "text" && i.content.trim())
  );

  useEffect(() => {
    if (!selectedPort && runningInstances.length > 0)
      setSelectedPort(runningInstances[0].port);
  }, [runningInstances, selectedPort]);

  return (
    <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      {contextHolder}
      {notificationContextHolder}

      {/* 左侧边栏 - 收藏管理 */}
      <Sider
        width={220}
        style={{
          background: "#fff",
          borderRight: "1px solid #f0f0f0",
        }}
        collapsible
        collapsedWidth={0}
        trigger={null}
      >
        <div
          ref={sidebarRef}
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            userSelect: isDraggingSplit ? "none" : "auto",
          }}
          onMouseMove={isDraggingSplit ? handleSplitDrag : undefined}
          onMouseUp={isDraggingSplit ? handleSplitDragEnd : undefined}
          onMouseLeave={isDraggingSplit ? handleSplitDragEnd : undefined}
        >
          {/* 搜索框 */}
          <div style={{ padding: "12px 12px 8px 12px", flexShrink: 0 }}>
            <Input
              size="small"
              placeholder="搜索房间/用户..."
              prefix={<SearchOutlined style={{ color: "#bfbfbf" }} />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </div>

          {/* 收藏的房间 */}
          <div
            style={{
              height: `calc(${sidebarSplit}% - 24px)`,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              padding: "0 12px 4px 12px",
            }}
          >
            <Flex
              align="center"
              gap={6}
              style={{ marginBottom: 8, flexShrink: 0 }}
            >
              <StarFilled style={{ color: "#faad14" }} />
              <Text strong style={{ fontSize: 13 }}>
                收藏房间
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                (
                {
                  favoriteRooms.filter(
                    (r) =>
                      !searchText ||
                      r.name.toLowerCase().includes(searchText.toLowerCase()) ||
                      r.id.includes(searchText)
                  ).length
                }
                /{favoriteRooms.length})
              </Text>
            </Flex>
            <div style={{ flex: 1, overflow: "auto" }}>
              {favoriteRooms.length > 0 ? (
                <Flex vertical gap={4}>
                  {favoriteRooms
                    .filter(
                      (room) =>
                        !searchText ||
                        room.name
                          .toLowerCase()
                          .includes(searchText.toLowerCase()) ||
                        room.id.includes(searchText)
                    )
                    .map((room) => (
                      <Card
                        key={room.id}
                        size="small"
                        style={{ cursor: "pointer" }}
                        styles={{ body: { padding: "8px 12px" } }}
                        onClick={() => {
                          setRoomId(room.id);
                          if (!isRunning && connected) openRoom.mutate(room.id);
                        }}
                      >
                        <Flex justify="space-between" align="center">
                          <Flex
                            vertical
                            gap={2}
                            style={{ minWidth: 0, flex: 1 }}
                          >
                            <Text style={{ fontSize: 13 }} ellipsis>
                              {room.name}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              ID:{" "}
                              <span
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(room.id);
                                  messageApi.success("已复制 ID");
                                }}
                                title="点击复制"
                              >
                                {room.id}
                              </span>
                            </Text>
                          </Flex>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavoriteRoom(room.id);
                            }}
                          />
                        </Flex>
                      </Card>
                    ))}
                </Flex>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  暂无收藏，输入房间 ID 后点击 ⭐ 收藏
                </Text>
              )}
            </div>
          </div>

          {/* 可拖拽的分割条 */}
          <div
            style={{
              height: 8,
              background: isDraggingSplit ? "#e6f4ff" : "#f5f5f5",
              cursor: "row-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderTop: "1px solid #f0f0f0",
              borderBottom: "1px solid #f0f0f0",
            }}
            onMouseDown={() => setIsDraggingSplit(true)}
          >
            <div
              style={{
                width: 30,
                height: 3,
                background: "#d9d9d9",
                borderRadius: 2,
              }}
            />
          </div>

          {/* 收藏的用户 */}
          <div
            style={{
              height: `calc(${100 - sidebarSplit}% - 24px)`,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              padding: "8px 12px 12px 12px",
            }}
          >
            <Flex
              align="center"
              justify="space-between"
              style={{ marginBottom: 8, flexShrink: 0 }}
            >
              <Flex align="center" gap={6}>
                <UserOutlined style={{ color: "#1677ff" }} />
                <Text strong style={{ fontSize: 13 }}>
                  收藏用户
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  (
                  {
                    favoriteUsers.filter(
                      (u) =>
                        !searchText ||
                        u.name
                          .toLowerCase()
                          .includes(searchText.toLowerCase()) ||
                        u.id.includes(searchText)
                    ).length
                  }
                  /{favoriteUsers.length})
                </Text>
              </Flex>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={addFavoriteUser}
              />
            </Flex>
            <div style={{ flex: 1, overflow: "auto" }}>
              {favoriteUsers.length > 0 ? (
                <Flex vertical gap={4}>
                  {favoriteUsers
                    .filter(
                      (user) =>
                        !searchText ||
                        user.name
                          .toLowerCase()
                          .includes(searchText.toLowerCase()) ||
                        user.id.includes(searchText)
                    )
                    .map((user) => (
                      <Card
                        key={user.id}
                        size="small"
                        styles={{ body: { padding: "8px 12px" } }}
                      >
                        <Flex justify="space-between" align="center">
                          <Flex
                            vertical
                            gap={2}
                            style={{ minWidth: 0, flex: 1 }}
                          >
                            <Text style={{ fontSize: 13 }} ellipsis>
                              {user.name}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              ID:{" "}
                              <span
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(user.id);
                                  messageApi.success("已复制 ID");
                                }}
                                title="点击复制"
                              >
                                {user.id}
                              </span>
                            </Text>
                          </Flex>
                          <Space size={2}>
                            <Button
                              type="text"
                              size="small"
                              icon={<UserOutlined />}
                              onClick={() => {
                                setUserId(user.id);
                                if (!isRunning && connected)
                                  openChat.mutate(user.id);
                              }}
                              title="聊天"
                            />
                            <Button
                              type="text"
                              size="small"
                              icon={<HomeOutlined />}
                              onClick={() => {
                                setUserId(user.id);
                                if (!isRunning && connected)
                                  openUser.mutate(user.id);
                              }}
                              title="主页"
                            />
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => removeFavoriteUser(user.id)}
                              title="删除"
                            />
                          </Space>
                        </Flex>
                      </Card>
                    ))}
                </Flex>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  点击 + 添加收藏用户
                </Text>
              )}
            </div>
          </div>
        </div>
      </Sider>

      {/* 主内容区 */}
      <Content style={{ padding: 16 }}>
        <Flex vertical gap={12} style={{ maxWidth: 500 }}>
          {/* 顶部栏 */}
          <Flex justify="space-between" align="center">
            <Flex align="center" gap={8}>
              <Text strong style={{ fontSize: 18 }}>
                Pico
              </Text>
              {isSubscribed ? (
                <Tag
                  color="gold"
                  icon={<CrownOutlined />}
                  style={{ margin: 0 }}
                >
                  会员
                </Tag>
              ) : (
                <Tag style={{ margin: 0 }}>
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
              />
              <Button
                size="small"
                type="text"
                icon={<LogoutOutlined />}
                onClick={signOut}
              />
            </Space>
          </Flex>

          {/* 设置面板 */}
          {showSettings && (
            <Card size="small">
              <Flex vertical gap={8}>
                <Flex justify="space-between" align="center">
                  <Text type="secondary">ADB</Text>
                  <Tag
                    color={adbInfo?.data?.found ? "success" : "error"}
                    style={{ margin: 0 }}
                  >
                    {adbInfo?.data?.found ? "OK" : "未找到"}
                  </Tag>
                </Flex>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    size="small"
                    placeholder="自定义路径"
                    value={customAdbPath}
                    onChange={(e) => setCustomAdbPath(e.target.value)}
                  />
                  <Button
                    size="small"
                    onClick={() => setAdbPath.mutate(customAdbPath)}
                  >
                    设置
                  </Button>
                </Space.Compact>
              </Flex>
            </Card>
          )}

          {/* 连接状态 */}
          <Card
            size="small"
            style={{ background: connected ? "#f6ffed" : "#fff" }}
          >
            {!connected ? (
              <Space.Compact style={{ width: "100%" }}>
                <Select
                  style={{ flex: 1 }}
                  size="small"
                  placeholder="选择模拟器"
                  value={selectedPort}
                  onChange={setSelectedPort}
                  options={runningInstances.map((i) => ({
                    label: i.display_name,
                    value: i.port,
                  }))}
                  notFoundContent="未发现"
                  suffixIcon={<DownOutlined />}
                />
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => refetchInstances()}
                />
                <Button
                  size="small"
                  type="primary"
                  icon={<LinkOutlined />}
                  onClick={() =>
                    selectedPort && adbConnect.mutate(selectedPort)
                  }
                  disabled={!selectedPort}
                  loading={adbConnect.isPending}
                >
                  连接
                </Button>
              </Space.Compact>
            ) : (
              <Flex justify="space-between" align="center">
                <Flex align="center" gap={6}>
                  <LinkOutlined style={{ color: "#52c41a" }} />
                  <Text style={{ color: "#52c41a" }}>已连接</Text>
                </Flex>
                <Button
                  size="small"
                  icon={<DisconnectOutlined />}
                  onClick={() => adbDisconnect.mutate()}
                  disabled={isRunning}
                >
                  断开
                </Button>
              </Flex>
            )}
          </Card>

          {/* 跳转房间 */}
          {connected && (
            <Card size="small">
              <Flex vertical gap={8}>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    size="small"
                    placeholder="房间 ID"
                    prefix={<HomeOutlined />}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    onPressEnter={() => roomId && openRoom.mutate(roomId)}
                    disabled={isRunning}
                  />
                  <Button
                    size="small"
                    icon={<StarOutlined />}
                    onClick={addFavoriteRoom}
                    disabled={!roomId || isRunning}
                    title="收藏"
                  />
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => openRoom.mutate(roomId)}
                    disabled={!roomId || isRunning}
                    loading={openRoom.isPending}
                  >
                    跳转
                  </Button>
                </Space.Compact>
                {favoriteRooms.length > 0 && (
                  <Flex wrap="wrap" gap={4}>
                    {favoriteRooms.map((room) => (
                      <Tag
                        key={room.id}
                        icon={<StarFilled style={{ color: "#faad14" }} />}
                        closable
                        onClose={() => removeFavoriteRoom(room.id)}
                        style={{ cursor: "pointer", margin: 0 }}
                        onClick={() => {
                          setRoomId(room.id);
                          if (!isRunning) openRoom.mutate(room.id);
                        }}
                      >
                        {room.name}
                      </Tag>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Card>
          )}

          {/* 跳转用户聊天 */}
          {connected && (
            <Card size="small">
              <Flex vertical gap={8}>
                <Space.Compact style={{ width: "100%" }}>
                  <Input
                    size="small"
                    placeholder="用户 ID"
                    prefix={<UserOutlined />}
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    onPressEnter={() => userId && openChat.mutate(userId)}
                    disabled={isRunning}
                  />
                  <Button
                    size="small"
                    icon={<StarOutlined />}
                    onClick={() => {
                      if (!userId.trim()) {
                        messageApi.warning("请先输入用户 ID");
                        return;
                      }
                      if (favoriteUsers.some((u) => u.id === userId)) {
                        messageApi.warning("该用户已收藏");
                        return;
                      }
                      setNewUserId(userId);
                      setNewUserName(`用户${userId}`);
                      setShowUserModal(true);
                    }}
                    disabled={!userId || isRunning}
                    title="收藏"
                  />
                  <Button
                    size="small"
                    type="primary"
                    onClick={() => openChat.mutate(userId)}
                    disabled={!userId || isRunning}
                    loading={openChat.isPending}
                  >
                    聊天
                  </Button>
                  <Button
                    size="small"
                    onClick={() => openUser.mutate(userId)}
                    disabled={!userId || isRunning}
                    loading={openUser.isPending}
                  >
                    主页
                  </Button>
                </Space.Compact>
                {favoriteUsers.length > 0 && (
                  <Flex wrap="wrap" gap={4}>
                    {favoriteUsers.map((user) => (
                      <Tag
                        key={user.id}
                        icon={<UserOutlined style={{ color: "#1677ff" }} />}
                        closable
                        onClose={() => removeFavoriteUser(user.id)}
                        style={{ cursor: "pointer", margin: 0 }}
                        onClick={() => {
                          setUserId(user.id);
                          if (!isRunning) openChat.mutate(user.id);
                        }}
                      >
                        {user.name}
                      </Tag>
                    ))}
                  </Flex>
                )}
              </Flex>
            </Card>
          )}

          {/* 消息编辑 */}
          <Card
            size="small"
            title={
              <Flex align="center" gap={6}>
                <span>消息</span>
                {selectedTemplate && (
                  <Tag color="blue" style={{ margin: 0 }}>
                    {selectedTemplate}
                  </Tag>
                )}
              </Flex>
            }
            extra={
              <Space size={2}>
                <Dropdown
                  menu={{
                    items:
                      templates.length > 0
                        ? templates.map((t) => ({
                            key: t.name,
                            label: (
                              <Flex
                                justify="space-between"
                                align="center"
                                style={{ minWidth: 120 }}
                              >
                                <span>
                                  {defaultTemplate === t.name ? "⭐ " : ""}
                                  {t.name}
                                </span>
                                <Space size={2}>
                                  <Button
                                    type="text"
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAsDefault(t.name);
                                    }}
                                  >
                                    默认
                                  </Button>
                                  <Popconfirm
                                    title="删除?"
                                    onConfirm={(e) => {
                                      e?.stopPropagation();
                                      deleteTemplate(t.name);
                                    }}
                                    okText="是"
                                    cancelText="否"
                                  >
                                    <Button
                                      type="text"
                                      size="small"
                                      danger
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      删
                                    </Button>
                                  </Popconfirm>
                                </Space>
                              </Flex>
                            ),
                            onClick: () => loadTemplate(t.name),
                          }))
                        : [{ key: "empty", label: "无模板", disabled: true }],
                  }}
                  trigger={["click"]}
                >
                  <Button size="small" type="text">
                    模板
                  </Button>
                </Dropdown>
                <Button
                  size="small"
                  type="text"
                  icon={<SaveOutlined />}
                  onClick={saveAsNewTemplate}
                />
              </Space>
            }
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableMessageItem
                    key={item.id}
                    item={item}
                    isRunning={isRunning}
                    onUpdate={(data) => updateItem(item.id, data)}
                    onRemove={() => removeItem(item.id)}
                    canRemove={items.length > 1}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Space size={4}>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => addItem("text")}
                disabled={isRunning}
              >
                文字
              </Button>
              <Button
                size="small"
                icon={<PlusOutlined />}
                onClick={() => addItem("photo")}
                disabled={isRunning}
              >
                图片
              </Button>
            </Space>
          </Card>

          {/* 参数设置 */}
          <Card size="small">
            <Flex gap={24}>
              <Flex vertical gap={4} style={{ flex: 1 }}>
                <Flex justify="space-between" align="center">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    人数
                  </Text>
                  <InputNumber
                    size="small"
                    min={1}
                    max={200}
                    value={maxUsers}
                    onChange={(v) => setMaxUsers(v || 10)}
                    disabled={isRunning}
                    style={{ width: 60 }}
                  />
                </Flex>
                <Slider
                  min={1}
                  max={200}
                  value={maxUsers}
                  onChange={setMaxUsers}
                  disabled={isRunning}
                  tooltip={{ formatter: (v) => `${v}人` }}
                />
              </Flex>
              <Flex vertical gap={4} style={{ flex: 1 }}>
                <Flex justify="space-between" align="center">
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    间隔
                  </Text>
                  <InputNumber
                    size="small"
                    min={1}
                    max={30}
                    value={delay}
                    onChange={(v) => setDelay(v || 5)}
                    disabled={isRunning}
                    style={{ width: 60 }}
                  />
                </Flex>
                <Slider
                  min={1}
                  max={30}
                  value={delay}
                  onChange={setDelay}
                  disabled={isRunning}
                  tooltip={{ formatter: (v) => `${v}秒` }}
                />
              </Flex>
            </Flex>
          </Card>

          {/* 进度条 */}
          {isRunning && (
            <Card size="small" style={{ background: "#e6f4ff" }}>
              <Flex
                justify="space-between"
                align="center"
                style={{ marginBottom: 4 }}
              >
                <Flex align="center" gap={6}>
                  <Text>发送中</Text>
                  {autoStatus?.data?.ocr_in_progress && (
                    <Tag color="orange" style={{ margin: 0 }}>
                      OCR
                    </Tag>
                  )}
                </Flex>
                <Text strong>
                  {processed}/{total}
                </Text>
              </Flex>
              <Progress
                percent={total > 0 ? Math.round((processed / total) * 100) : 0}
                status="active"
                strokeColor={
                  autoStatus?.data?.ocr_in_progress ? "#faad14" : "#1677ff"
                }
                size="small"
              />
            </Card>
          )}

          {/* 操作按钮 */}
          <Flex gap={8}>
            {!isRunning ? (
              <>
                <Button
                  icon={<ThunderboltOutlined />}
                  onClick={() => testInChat.mutate()}
                  loading={testInChat.isPending}
                  disabled={!connected || !hasContent}
                  style={{ flex: 1 }}
                >
                  测试
                </Button>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={() => startAuto.mutate()}
                  disabled={!connected || !hasContent}
                  loading={startAuto.isPending}
                  style={{ flex: 2 }}
                >
                  开始发送
                </Button>
              </>
            ) : (
              <Button
                danger
                type="primary"
                icon={<StopOutlined />}
                onClick={() => stopAuto.mutate()}
                block
              >
                停止
              </Button>
            )}
          </Flex>
        </Flex>
      </Content>

      {/* 右侧日志栏 */}
      <Sider
        width={280}
        style={{
          background: "#fff",
          borderLeft: "1px solid #f0f0f0",
          padding: 12,
        }}
      >
        {/* 快捷导航 */}
        {connected && (
          <Card size="small" style={{ marginBottom: 12 }}>
            <Flex vertical gap={8}>
              <Text strong style={{ fontSize: 12 }}>
                快捷导航
              </Text>
              <Flex gap={8}>
                <Button
                  size="small"
                  onClick={() => tapMeTab.mutate()}
                  loading={tapMeTab.isPending}
                  disabled={isRunning}
                  style={{ flex: 1 }}
                >
                  我的 Tab
                </Button>
                <Button
                  size="small"
                  onClick={() => tapNovaUserList.mutate()}
                  loading={tapNovaUserList.isPending}
                  disabled={isRunning}
                  style={{ flex: 1 }}
                >
                  新星榜
                </Button>
              </Flex>
              <Button
                size="small"
                type="primary"
                onClick={() => navigateToNovaList.mutate()}
                loading={navigateToNovaList.isPending}
                disabled={isRunning}
                block
              >
                一键进入新星用户榜
              </Button>
            </Flex>
          </Card>
        )}

        {/* 路由调试 */}
        <Card size="small" style={{ marginBottom: 12 }}>
          <Flex vertical gap={8}>
            <Text strong style={{ fontSize: 12 }}>
              路由调试
            </Text>
            <Select
              size="small"
              placeholder="选择路由"
              style={{ width: "100%" }}
              value={debugRoute}
              onChange={(v) => {
                setDebugRoute(v);
                // 自动填充参数提示
                const hints: Record<string, string> = {
                  openRoom: "room_id=",
                  openChat: "uid=",
                  openUser: "uid=",
                  openHome: "tabId=0",
                  openNotifications: "tabid=0",
                  openPostDetail: "fid=",
                  openGiftSeries: "tabId=2&subTabId=1&mid=",
                  userGallery: "mid=",
                  openAddressBookActivity: "tabId=0",
                  openUrl: "url=",
                  openWindow: "url=",
                  openGameUrl: "url=",
                };
                setDebugParams(hints[v] || "");
              }}
              options={[
                // === 底部 Tab 导航 ===
                { label: "🏠 openHome → Tab0 娱乐 (tabId)", value: "openHome" },
                { label: "🎮 openFeedVc → Tab1 约玩", value: "openFeedVc" },
                {
                  label: "💬 openMessageList → Tab2 消息",
                  value: "openMessageList",
                },
                { label: "⚙️ openSetting → 设置页", value: "openSetting" },
                {
                  label: "👀 openVisitorList → 访客列表",
                  value: "openVisitorList",
                },
                // === 房间/用户 ===
                { label: "openRoom (room_id)", value: "openRoom" },
                { label: "openChat (uid)", value: "openChat" },
                { label: "openUser (uid)", value: "openUser" },
                { label: "userGallery (mid)", value: "userGallery" },
                { label: "editUserProfile", value: "editUserProfile" },
                // === 通知/消息 ===
                {
                  label: "openNotifications (tabid)",
                  value: "openNotifications",
                },
                {
                  label: "openAddressBookActivity (tabId)",
                  value: "openAddressBookActivity",
                },
                { label: "openInviteUnion", value: "openInviteUnion" },
                // === 帖子/动态 ===
                { label: "createPost", value: "createPost" },
                { label: "openPostDetail (fid)", value: "openPostDetail" },
                // === 充值/礼物 ===
                { label: "openRecharge", value: "openRecharge" },
                { label: "customRecharge", value: "customRecharge" },
                {
                  label: "openGiftSeries (tabId,subTabId,mid)",
                  value: "openGiftSeries",
                },
                { label: "sendLiveGift", value: "sendLiveGift" },
                { label: "openRedPacket", value: "openRedPacket" },
                // === 直播 ===
                { label: "openCreateRoom", value: "openCreateRoom" },
                { label: "openFeaturePanel", value: "openFeaturePanel" },
                // === 其他 ===
                { label: "openIntimacy", value: "openIntimacy" },
                { label: "openMedal (deprecated)", value: "openMedal" },
                {
                  label: "openEnrichImpression",
                  value: "openEnrichImpression",
                },
                { label: "openSigninDialog", value: "openSigninDialog" },
                { label: "openDate", value: "openDate" },
                { label: "openMall", value: "openMall" },
                // === WebView ===
                { label: "openUrl (url)", value: "openUrl" },
                { label: "openWindow (url)", value: "openWindow" },
                { label: "openGameUrl (url)", value: "openGameUrl" },
              ]}
            />
            <Input
              size="small"
              placeholder={
                [
                  "openMessageList",
                  "openSetting",
                  "openRecharge",
                  "openCreateRoom",
                  "createPost",
                  "openIntimacy",
                  "openFeedVc",
                  "editUserProfile",
                  "openVisitorList",
                  "openRedPacket",
                  "openInviteUnion",
                  "openMedal",
                  "openEnrichImpression",
                  "customRecharge",
                  "openFeaturePanel",
                  "sendLiveGift",
                  "openSigninDialog",
                  "openDate",
                  "openMall",
                ].includes(debugRoute)
                  ? "无需参数"
                  : "参数 (如: uid=123)"
              }
              value={debugParams}
              onChange={(e) => setDebugParams(e.target.value)}
              disabled={[
                "openMessageList",
                "openSetting",
                "openRecharge",
                "openCreateRoom",
                "createPost",
                "openIntimacy",
                "openFeedVc",
                "editUserProfile",
                "openVisitorList",
                "openRedPacket",
                "openInviteUnion",
                "openMedal",
                "openEnrichImpression",
                "customRecharge",
                "openFeaturePanel",
                "sendLiveGift",
                "openSigninDialog",
                "openDate",
                "openMall",
              ].includes(debugRoute)}
            />
            <Button
              size="small"
              type="primary"
              onClick={() => {
                if (!debugRoute) {
                  messageApi.warning("请选择路由");
                  return;
                }
                const route = debugParams
                  ? `${debugRoute}?${debugParams}`
                  : debugRoute;
                openRoute.mutate(route);
              }}
              loading={openRoute.isPending}
              disabled={!connected || !debugRoute}
            >
              执行
            </Button>
          </Flex>
        </Card>

        <Flex
          justify="space-between"
          align="center"
          style={{ marginBottom: 8 }}
        >
          <Text strong>日志</Text>
          <Button
            size="small"
            type="text"
            icon={<ClearOutlined />}
            onClick={() => clearLogs.mutate()}
          >
            清空
          </Button>
        </Flex>
        <div
          ref={logRef}
          style={{
            height: "calc(100vh - 80px)",
            overflow: "auto",
            fontFamily: "monospace",
            fontSize: 11,
            color: "#666",
            lineHeight: 1.5,
          }}
        >
          {logs?.data?.logs?.length ? (
            logs.data.logs.map((log, i) => (
              <div
                key={i}
                style={{ padding: "2px 0", borderBottom: "1px solid #f5f5f5" }}
              >
                {log}
              </div>
            ))
          ) : (
            <Text type="secondary">暂无日志</Text>
          )}
        </div>
      </Sider>

      {/* 收藏房间弹窗 */}
      <Modal
        title="收藏房间"
        open={showFavoriteModal}
        onOk={confirmAddFavorite}
        onCancel={() => {
          setShowFavoriteModal(false);
          setFavoriteRoomName("");
        }}
        okText="确定"
        cancelText="取消"
      >
        <Flex vertical gap={12}>
          <div>
            <Text type="secondary">房间 ID: </Text>
            <Text strong>{roomId}</Text>
          </div>
          <Input
            placeholder="输入房间名称（方便识别）"
            value={favoriteRoomName}
            onChange={(e) => setFavoriteRoomName(e.target.value)}
            onPressEnter={confirmAddFavorite}
            autoFocus
          />
        </Flex>
      </Modal>

      {/* 收藏用户弹窗 */}
      <Modal
        title="收藏用户"
        open={showUserModal}
        onOk={confirmAddUser}
        onCancel={() => {
          setShowUserModal(false);
          setNewUserId("");
          setNewUserName("");
        }}
        okText="确定"
        cancelText="取消"
      >
        <Flex vertical gap={12}>
          <Input
            placeholder="用户 ID"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            prefix={<UserOutlined />}
          />
          <Input
            placeholder="用户名称（方便识别）"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onPressEnter={confirmAddUser}
          />
        </Flex>
      </Modal>
    </Layout>
  );
}
