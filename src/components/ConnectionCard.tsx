import { useState, useEffect } from "react";
import { Card, Flex, Space, Select, Input, Button, Typography } from "antd";
import {
  ReloadOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adbApi } from "../api";
import "../styles/shared.css";

const { Text } = Typography;

interface ConnectionCardProps {
  isRunning: boolean;
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
}

export function ConnectionCard({ isRunning, onMessage }: ConnectionCardProps) {
  const qc = useQueryClient();
  const [selectedPort, setSelectedPort] = useState<number | null>(null);

  const { data: adbStatus } = useQuery({
    queryKey: ["adb"],
    queryFn: adbApi.status,
    staleTime: 10000,
  });

  const { data: instances, refetch: refetchInstances } = useQuery({
    queryKey: ["instances"],
    queryFn: adbApi.instances,
    staleTime: 10000,
  });

  const connected = adbStatus?.data?.connected ?? false;
  const runningInstances = instances?.data?.filter((i) => i.running) ?? [];

  useEffect(() => {
    if (!selectedPort && runningInstances.length > 0) {
      setSelectedPort(runningInstances[0].port);
    }
  }, [runningInstances, selectedPort]);

  const adbConnect = useMutation({
    mutationFn: (port: number) => adbApi.connect(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adb"] });
      onMessage("success", "已连接");
    },
    onError: () => onMessage("error", "连接失败"),
  });

  const adbDisconnect = useMutation({
    mutationFn: adbApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adb"] }),
    onError: (err: Error) => onMessage("error", `断开连接失败: ${err.message}`),
  });

  return (
    <Card size="small" className={connected ? "card-connected" : ""}>
      {!connected ? (
        <Flex vertical gap={8}>
          <Space.Compact className="w-full">
            <Select
              className="flex-1"
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
              aria-label="刷新模拟器列表"
            />
            <Button
              size="small"
              type="primary"
              icon={<LinkOutlined />}
              onClick={() => selectedPort && adbConnect.mutate(selectedPort)}
              disabled={!selectedPort}
              loading={adbConnect.isPending}
            >
              连接
            </Button>
          </Space.Compact>
          <Space.Compact className="w-full">
            <Input
              size="small"
              placeholder="手动输入端口 (如 7555)"
              className="flex-1"
              onPressEnter={(e) => {
                const port = parseInt((e.target as HTMLInputElement).value);
                if (port > 0) adbConnect.mutate(port);
              }}
            />
            <Button
              size="small"
              onClick={() => {
                const input = document.querySelector(
                  'input[placeholder*="手动输入端口"]'
                ) as HTMLInputElement;
                const port = parseInt(input?.value || "0");
                if (port > 0) {
                  adbConnect.mutate(port);
                } else {
                  onMessage("warning", "请输入有效端口");
                }
              }}
              loading={adbConnect.isPending}
            >
              连接
            </Button>
          </Space.Compact>
        </Flex>
      ) : (
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={6}>
            <LinkOutlined className="icon-success" />
            <Text className="icon-success">已连接</Text>
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
  );
}

export function useConnectionStatus() {
  const { data: adbStatus } = useQuery({
    queryKey: ["adb"],
    queryFn: adbApi.status,
    staleTime: 10000,
  });
  return adbStatus?.data?.connected ?? false;
}
