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
} from "@ant-design/icons";
import { useAuth } from "./useAuth";
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
  const { profile, signOut, canUseFeature, recordUsage, getRemainingUsage } =
    useAuth();
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [items, setItems] = useState<ContentItemWithId[]>(() =>
    withIds([{ type: "text", content: "" }])
  );
  const [maxUsers, setMaxUsers] = useState(10);
  const [delay, setDelay] = useState(5);
  const [showSettings, setShowSettings] = useState(false);
  const [customAdbPath, setCustomAdbPath] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [defaultTemplate, setDefaultTemplate] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);

  const remainingUsage = getRemainingUsage();
  const isSubscribed = profile?.is_subscribed ?? false;

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
  }, []);

  const saveTemplates = (t: Template[]) => {
    setTemplates(t);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
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
    </Layout>
  );
}
