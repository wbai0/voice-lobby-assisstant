import { useState, useRef, useEffect } from "react";
import { Layout, Flex, Tag, Typography, Space, Input, Button } from "antd";
import { CloudDownloadOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { adbApi, uiAutomatorApi } from "../api";
import { useUpdater } from "../useUpdater";
import "./SettingsPanel.css";
import "../styles/shared.css";

const { Sider } = Layout;
const { Text } = Typography;

interface SettingsPanelProps {
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export function SettingsPanel({
  onMessage,
  width,
  onWidthChange,
}: SettingsPanelProps) {
  const qc = useQueryClient();
  const updater = useUpdater();
  const [customAdbPath, setCustomAdbPath] = useState("");

  const { data: adbInfo } = useQuery({
    queryKey: ["adbInfo"],
    queryFn: adbApi.getInfo,
    staleTime: 30000,
  });

  const setAdbPath = useMutation({
    mutationFn: (path: string) => adbApi.setPath(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adbInfo"] });
      onMessage("success", "已设置");
    },
    onError: (err: Error) =>
      onMessage("error", `设置ADB路径失败: ${err.message}`),
  });

  const [uiAutomatorResult, setUiAutomatorResult] = useState<string | null>(
    null,
  );

  const testUiAutomator = useMutation({
    mutationFn: uiAutomatorApi.test,
    onSuccess: (result) => {
      setUiAutomatorResult(result.data);
      onMessage("success", "UI检测完成");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      onMessage("error", `UI检测失败: ${message}`);
    },
  });

  // Resize logic
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(200, Math.min(500, startWidth.current + delta));
      onWidthChange(newWidth);
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
  }, [onWidthChange]);

  return (
    <Sider width={width} theme="light" className="settings-sider">
      <div className="settings-content">
        <Text
          strong
          style={{ fontSize: 14, marginBottom: 16, display: "block" }}
        >
          设置
        </Text>

        <Flex vertical gap={16}>
          <Flex justify="space-between" align="center">
            <Text type="secondary">ADB</Text>
            <Tag
              color={adbInfo?.data?.found ? "success" : "error"}
              className="tag-no-margin"
            >
              {adbInfo?.data?.found ? "OK" : "未找到"}
            </Tag>
          </Flex>
          <Text type="secondary" className="text-xs text-break">
            路径: {adbInfo?.data?.path || "未知"}
          </Text>
          {adbInfo?.data?.bundled_path && (
            <Text type="secondary" className="text-xs text-break">
              打包路径: {adbInfo.data.bundled_path}
            </Text>
          )}
          <Space.Compact className="w-full">
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

          <Flex
            justify="space-between"
            align="center"
            className="settings-divider"
          >
            <Text type="secondary">UI检测</Text>
            <Button
              size="small"
              onClick={() => testUiAutomator.mutate()}
              loading={testUiAutomator.isPending}
            >
              测试检测
            </Button>
          </Flex>
          {uiAutomatorResult && (
            <div
              style={{
                background: "#f5f5f5",
                padding: 8,
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                maxHeight: 150,
                overflow: "auto",
              }}
            >
              {uiAutomatorResult}
            </div>
          )}

          <Flex
            justify="space-between"
            align="center"
            className="settings-divider"
          >
            <Text type="secondary">版本 1.0.18</Text>
            {updater.available ? (
              <Button
                size="small"
                type="primary"
                icon={<CloudDownloadOutlined />}
                onClick={() => updater.downloadAndInstall()}
                loading={updater.downloading}
              >
                {updater.downloading
                  ? `${updater.progress}%`
                  : `更新到 ${updater.version}`}
              </Button>
            ) : (
              <Button
                size="small"
                loading={updater.checking}
                onClick={async () => {
                  const hasUpdate = await updater.checkForUpdates();
                  if (!hasUpdate) {
                    onMessage("success", "已是最新版本");
                  }
                }}
              >
                {updater.checking ? "检查中..." : "检查更新"}
              </Button>
            )}
          </Flex>
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
