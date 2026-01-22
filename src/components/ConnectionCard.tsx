import { useState, useEffect } from "react";
import { Modal, Flex, Select, Input, Button } from "antd";
import {
  ReloadOutlined,
  LinkOutlined,
  DisconnectOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adbApi } from "../api";
import "../styles/shared.css";

interface ConnectionModalProps {
  open: boolean;
  onClose: () => void;
  isRunning: boolean;
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
}

export function ConnectionModal({
  open,
  onClose,
  isRunning,
  onMessage,
}: ConnectionModalProps) {
  const qc = useQueryClient();
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [manualPort, setManualPort] = useState("");

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
  const currentPort = adbStatus?.data?.port;
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
      onClose();
    },
    onError: () => onMessage("error", "连接失败"),
  });

  const adbDisconnect = useMutation({
    mutationFn: adbApi.disconnect,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adb"] }),
    onError: (err: Error) => onMessage("error", `断开失败: ${err.message}`),
  });

  const handleConnect = () => {
    const port = manualPort ? parseInt(manualPort) : selectedPort;
    if (port && port > 0) {
      adbConnect.mutate(port);
    } else {
      onMessage("warning", "请选择或输入端口");
    }
  };

  return (
    <Modal
      title="连接模拟器"
      open={open}
      onCancel={onClose}
      footer={null}
      width={400}
    >
      <Flex vertical gap={16} style={{ padding: "8px 0" }}>
        {connected && currentPort && (
          <Flex
            align="center"
            justify="space-between"
            style={{
              padding: "8px 12px",
              background: "#e6f7e6",
              borderRadius: 6,
              color: "#389e0d",
              fontSize: 13,
            }}
          >
            <span>当前连接: 端口 {currentPort}</span>
            <Button
              size="small"
              type="text"
              danger
              icon={<DisconnectOutlined />}
              onClick={() => adbDisconnect.mutate()}
              disabled={isRunning}
            >
              断开
            </Button>
          </Flex>
        )}
        <Flex gap={8} align="center">
          <Select
            style={{ flex: 1 }}
            placeholder="选择模拟器"
            value={selectedPort}
            onChange={(v) => {
              setSelectedPort(v);
              setManualPort("");
            }}
            options={runningInstances.map((i) => ({
              label: i.display_name,
              value: i.port,
            }))}
            notFoundContent="未发现运行中的模拟器"
            allowClear
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => refetchInstances()}
          />
        </Flex>
        <Input
          placeholder="或手动输入端口"
          value={manualPort}
          onChange={(e) => {
            setManualPort(e.target.value);
            if (e.target.value) setSelectedPort(null);
          }}
          onPressEnter={handleConnect}
        />
        <Flex justify="end">
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={handleConnect}
            loading={adbConnect.isPending}
          >
            {connected ? "切换连接" : "连接"}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
}

interface StatusBarProps {
  connected: boolean;
  isRunning: boolean;
  onOpenConnection: () => void;
  onDisconnect: () => void;
}

export function StatusBar({
  connected,
  isRunning,
  onOpenConnection,
  onDisconnect,
}: StatusBarProps) {
  if (!connected) {
    return (
      <div
        onClick={onOpenConnection}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          padding: "8px 16px",
          background: "#f5f5f5",
          borderRadius: 20,
          cursor: "pointer",
          fontSize: 13,
          color: "#999",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        }}
      >
        <Flex align="center" gap={6}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#d9d9d9",
            }}
          />
          未连接
        </Flex>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        padding: "8px 16px",
        background: "#e6f7e6",
        borderRadius: 20,
        fontSize: 13,
        color: "#389e0d",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      <Flex align="center" gap={8}>
        <Flex
          align="center"
          gap={6}
          style={{ cursor: "pointer" }}
          onClick={onOpenConnection}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#52c41a",
            }}
          />
          已连接
        </Flex>
        <span style={{ color: "#b7eb8f" }}>|</span>
        <span
          style={{
            cursor: isRunning ? "not-allowed" : "pointer",
            opacity: isRunning ? 0.5 : 1,
          }}
          onClick={() => !isRunning && onDisconnect()}
        >
          断开
        </span>
      </Flex>
    </div>
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
