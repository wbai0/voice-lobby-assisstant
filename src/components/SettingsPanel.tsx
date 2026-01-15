import { useState } from "react";
import { Card, Flex, Tag, Typography, Space, Input, Button, Modal } from "antd";
import { CloudDownloadOutlined, EyeOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { adbApi, ocrApi } from "../api";
import { useUpdater } from "../useUpdater";
import "./SettingsPanel.css";
import "../styles/shared.css";

const { Text } = Typography;

interface SettingsPanelProps {
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
}

export function SettingsPanel({ onMessage }: SettingsPanelProps) {
  const qc = useQueryClient();
  const updater = useUpdater();
  const [customAdbPath, setCustomAdbPath] = useState("");
  const [ocrDiagModal, setOcrDiagModal] = useState<{
    open: boolean;
    result: {
      success: boolean;
      text: string;
      tessdata_path: string;
      tessdata_exists: boolean;
      chi_sim_exists: boolean;
      chi_sim_size: number;
      init_error: string | null;
      diagnostics: string[];
    } | null;
  }>({ open: false, result: null });

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

  const testOcr = useMutation({
    mutationFn: ocrApi.test,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      if (result.data.success) {
        onMessage("success", "OCR 测试成功");
        // 成功时也可以查看详情
        setOcrDiagModal({ open: true, result: result.data });
      } else {
        // 失败时显示详细诊断
        setOcrDiagModal({ open: true, result: result.data });
      }
    },
    onError: (err: Error) => onMessage("error", `OCR 测试失败: ${err.message}`),
  });

  return (
    <>
      <Card size="small">
        <Flex vertical gap={8}>
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

          {/* OCR 测试 */}
          <Flex
            justify="space-between"
            align="center"
            className="settings-divider"
          >
            <Text type="secondary">OCR</Text>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => testOcr.mutate()}
              loading={testOcr.isPending}
            >
              测试 OCR
            </Button>
          </Flex>

          <Flex
            justify="space-between"
            align="center"
            className="settings-divider"
          >
            <Text type="secondary">版本 1.0.14</Text>
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
      </Card>

      {/* OCR 诊断结果弹窗 */}
      <Modal
        title={
          ocrDiagModal.result?.success ? "✅ OCR 测试成功" : "❌ OCR 测试失败"
        }
        open={ocrDiagModal.open}
        onCancel={() => setOcrDiagModal({ open: false, result: null })}
        footer={[
          <Button
            key="close"
            onClick={() => setOcrDiagModal({ open: false, result: null })}
          >
            关闭
          </Button>,
        ]}
        width={600}
      >
        {ocrDiagModal.result && (
          <Flex vertical gap={8}>
            <Text strong>诊断信息:</Text>
            <div
              style={{
                background: "#f5f5f5",
                padding: 12,
                borderRadius: 4,
                maxHeight: 300,
                overflow: "auto",
                fontFamily: "monospace",
                fontSize: 12,
              }}
            >
              {ocrDiagModal.result.diagnostics.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.startsWith("✓")
                      ? "green"
                      : line.startsWith("✗")
                      ? "red"
                      : "inherit",
                  }}
                >
                  {line}
                </div>
              ))}
            </div>

            {ocrDiagModal.result.init_error && (
              <>
                <Text strong type="danger">
                  初始化错误:
                </Text>
                <Text
                  type="danger"
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                >
                  {ocrDiagModal.result.init_error}
                </Text>
              </>
            )}

            {ocrDiagModal.result.success && ocrDiagModal.result.text && (
              <>
                <Text strong>识别文字 (前500字):</Text>
                <div
                  style={{
                    background: "#f5f5f5",
                    padding: 12,
                    borderRadius: 4,
                    maxHeight: 150,
                    overflow: "auto",
                    fontSize: 12,
                  }}
                >
                  {ocrDiagModal.result.text.slice(0, 500)}
                </div>
              </>
            )}
          </Flex>
        )}
      </Modal>
    </>
  );
}
