import {
  Card,
  Flex,
  Slider,
  InputNumber,
  Typography,
  Tag,
  Progress,
  Button,
} from "antd";
import {
  PlayCircleOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import "./ControlPanel.css";
import "../styles/shared.css";

const { Text } = Typography;

interface ControlPanelProps {
  maxUsers: number;
  delay: number;
  isRunning: boolean;
  connected: boolean;
  hasContent: boolean;
  processed: number;
  total: number;
  ocrInProgress?: boolean;
  onMaxUsersChange: (value: number) => void;
  onDelayChange: (value: number) => void;
  onTest: () => void;
  onStart: () => void;
  onStop: () => void;
  testLoading: boolean;
  startLoading: boolean;
}

export function ControlPanel({
  maxUsers,
  delay,
  isRunning,
  connected,
  hasContent,
  processed,
  total,
  ocrInProgress,
  onMaxUsersChange,
  onDelayChange,
  onTest,
  onStart,
  onStop,
  testLoading,
  startLoading,
}: ControlPanelProps) {
  return (
    <>
      {/* 参数设置 */}
      <Card size="small">
        <Flex gap={24}>
          <Flex vertical gap={4} className="flex-1">
            <Flex justify="space-between" align="center">
              <Text type="secondary" className="text-sm">
                人数
              </Text>
              <InputNumber
                size="small"
                min={1}
                max={200}
                value={maxUsers}
                onChange={(v) => onMaxUsersChange(v || 10)}
                disabled={isRunning}
                className="input-number-md"
              />
            </Flex>
            <Slider
              min={1}
              max={200}
              value={maxUsers}
              onChange={onMaxUsersChange}
              disabled={isRunning}
              tooltip={{ formatter: (v) => `${v}人` }}
            />
          </Flex>
          <Flex vertical gap={4} className="flex-1">
            <Flex justify="space-between" align="center">
              <Text type="secondary" className="text-sm">
                间隔
              </Text>
              <InputNumber
                size="small"
                min={1}
                max={30}
                value={delay}
                onChange={(v) => onDelayChange(v || 5)}
                disabled={isRunning}
                className="input-number-md"
              />
            </Flex>
            <Slider
              min={1}
              max={30}
              value={delay}
              onChange={onDelayChange}
              disabled={isRunning}
              tooltip={{ formatter: (v) => `${v}秒` }}
            />
          </Flex>
        </Flex>
      </Card>

      {/* 进度条 */}
      {isRunning && (
        <Card size="small" className="card-running">
          <Flex
            justify="space-between"
            align="center"
            className="progress-header"
          >
            <Flex align="center" gap={6}>
              <Text>发送中</Text>
              {ocrInProgress && (
                <Tag color="orange" className="tag-no-margin">
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
            strokeColor={ocrInProgress ? "#faad14" : "#1677ff"}
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
              onClick={onTest}
              loading={testLoading}
              disabled={!connected || !hasContent}
              className="flex-1"
            >
              测试
            </Button>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={onStart}
              disabled={!connected || !hasContent}
              loading={startLoading}
              className="flex-2"
            >
              开始发送
            </Button>
          </>
        ) : (
          <Button
            danger
            type="primary"
            icon={<StopOutlined />}
            onClick={onStop}
            block
          >
            停止
          </Button>
        )}
      </Flex>
    </>
  );
}
