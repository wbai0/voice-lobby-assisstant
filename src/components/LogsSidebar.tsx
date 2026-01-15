import { useRef, useEffect, useState } from "react";
import {
  Layout,
  Card,
  Flex,
  Button,
  Space,
  Typography,
  Select,
  Input,
  message,
} from "antd";
import { ReloadOutlined, ClearOutlined } from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logsApi, adbApi } from "../api";
import "./LogsSidebar.css";
import "../styles/shared.css";

const { Sider } = Layout;
const { Text } = Typography;

interface LogsSidebarProps {
  connected: boolean;
  isRunning: boolean;
}

export function LogsSidebar({ connected, isRunning }: LogsSidebarProps) {
  const qc = useQueryClient();
  const [messageApi, contextHolder] = message.useMessage();
  const logRef = useRef<HTMLDivElement>(null);
  const [debugRoute, setDebugRoute] = useState("");
  const [debugParams, setDebugParams] = useState("");

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: () => logsApi.get(50),
    staleTime: 1000,
    refetchInterval: isRunning ? 1000 : false,
  });

  const clearLogs = useMutation({
    mutationFn: logsApi.clear,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["logs"] }),
    onError: (err: Error) => messageApi.error(`清除日志失败: ${err.message}`),
  });

  const tapMeTab = useMutation({
    mutationFn: () => adbApi.tapMeTab(),
    onSuccess: () => messageApi.success("已点击「我的」Tab"),
    onError: (err: Error) => messageApi.error(err.message),
  });

  const tapNovaUserList = useMutation({
    mutationFn: () => adbApi.tapNovaUserList(),
    onSuccess: () => messageApi.success("已点击「新星用户榜」"),
    onError: (err: Error) => messageApi.error(err.message),
  });

  const navigateToNovaList = useMutation({
    mutationFn: () => adbApi.navigateToNovaList(),
    onSuccess: () => messageApi.success("已导航到「新星用户榜」"),
    onError: (err: Error) => messageApi.error(err.message),
  });

  const openRoute = useMutation({
    mutationFn: (route: string) => adbApi.openRoute(route),
    onSuccess: () => messageApi.success("已执行"),
    onError: (err: Error) => messageApi.error(err.message),
  });

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs?.data?.logs]);

  const noParamRoutes = [
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
  ];

  const routeHints: Record<string, string> = {
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

  const routeOptions = [
    { label: "🏠 openHome → Tab0 娱乐 (tabId)", value: "openHome" },
    { label: "🎮 openFeedVc → Tab1 约玩", value: "openFeedVc" },
    { label: "💬 openMessageList → Tab2 消息", value: "openMessageList" },
    { label: "⚙️ openSetting → 设置页", value: "openSetting" },
    { label: "👀 openVisitorList → 访客列表", value: "openVisitorList" },
    { label: "openRoom (room_id)", value: "openRoom" },
    { label: "openChat (uid)", value: "openChat" },
    { label: "openUser (uid)", value: "openUser" },
    { label: "userGallery (mid)", value: "userGallery" },
    { label: "editUserProfile", value: "editUserProfile" },
    { label: "openNotifications (tabid)", value: "openNotifications" },
    {
      label: "openAddressBookActivity (tabId)",
      value: "openAddressBookActivity",
    },
    { label: "openInviteUnion", value: "openInviteUnion" },
    { label: "createPost", value: "createPost" },
    { label: "openPostDetail (fid)", value: "openPostDetail" },
    { label: "openRecharge", value: "openRecharge" },
    { label: "customRecharge", value: "customRecharge" },
    { label: "openGiftSeries (tabId,subTabId,mid)", value: "openGiftSeries" },
    { label: "sendLiveGift", value: "sendLiveGift" },
    { label: "openRedPacket", value: "openRedPacket" },
    { label: "openCreateRoom", value: "openCreateRoom" },
    { label: "openFeaturePanel", value: "openFeaturePanel" },
    { label: "openIntimacy", value: "openIntimacy" },
    { label: "openMedal (deprecated)", value: "openMedal" },
    { label: "openEnrichImpression", value: "openEnrichImpression" },
    { label: "openSigninDialog", value: "openSigninDialog" },
    { label: "openDate", value: "openDate" },
    { label: "openMall", value: "openMall" },
    { label: "openUrl (url)", value: "openUrl" },
    { label: "openWindow (url)", value: "openWindow" },
    { label: "openGameUrl (url)", value: "openGameUrl" },
  ];

  return (
    <Sider width={280} className="logs-sidebar">
      {contextHolder}

      {/* 快捷导航 */}
      {connected && (
        <Card size="small" className="card-quick-nav">
          <Flex vertical gap={8}>
            <Text strong className="text-sm">
              快捷导航
            </Text>
            <Flex gap={8}>
              <Button
                size="small"
                onClick={() => tapMeTab.mutate()}
                loading={tapMeTab.isPending}
                disabled={isRunning}
                className="flex-1"
              >
                我的 Tab
              </Button>
              <Button
                size="small"
                onClick={() => tapNovaUserList.mutate()}
                loading={tapNovaUserList.isPending}
                disabled={isRunning}
                className="flex-1"
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
      <Card size="small" className="card-quick-nav">
        <Flex vertical gap={8}>
          <Text strong className="text-sm">
            路由调试
          </Text>
          <Select
            size="small"
            placeholder="选择路由"
            className="w-full"
            value={debugRoute}
            onChange={(v) => {
              setDebugRoute(v);
              setDebugParams(routeHints[v] || "");
            }}
            options={routeOptions}
          />
          <Input
            size="small"
            placeholder={
              noParamRoutes.includes(debugRoute)
                ? "无需参数"
                : "参数 (如: uid=123)"
            }
            value={debugParams}
            onChange={(e) => setDebugParams(e.target.value)}
            disabled={noParamRoutes.includes(debugRoute)}
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

      <Flex justify="space-between" align="center" className="logs-header">
        <Text strong>日志</Text>
        <Space>
          {!isRunning && (
            <Button
              size="small"
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => qc.invalidateQueries({ queryKey: ["logs"] })}
              aria-label="刷新日志"
            >
              刷新
            </Button>
          )}
          <Button
            size="small"
            type="text"
            icon={<ClearOutlined />}
            onClick={() => clearLogs.mutate()}
            aria-label="清除日志"
          >
            清空
          </Button>
        </Space>
      </Flex>
      <div ref={logRef} className="logs-container">
        {logs?.data?.logs?.length ? (
          logs.data.logs.map((log, i) => (
            <div key={i} className="log-item">
              {log}
            </div>
          ))
        ) : (
          <Text type="secondary">暂无日志</Text>
        )}
      </div>
    </Sider>
  );
}
