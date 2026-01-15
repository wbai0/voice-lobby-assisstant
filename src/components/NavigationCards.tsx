import { useState } from "react";
import { Card, Flex, Space, Input, Button, Tag, Modal, Typography } from "antd";
import {
  HomeOutlined,
  UserOutlined,
  StarOutlined,
  StarFilled,
} from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adbApi } from "../api";
import "../styles/shared.css";

const { Text } = Typography;

const FAVORITE_ROOMS_KEY = "pico_favorite_rooms";
const FAVORITE_USERS_KEY = "pico_favorite_users";

interface FavoriteRoom {
  id: string;
  name: string;
}

interface FavoriteUser {
  id: string;
  name: string;
}

interface NavigationCardsProps {
  connected: boolean;
  isRunning: boolean;
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
}

export function NavigationCards({
  connected,
  isRunning,
  onMessage,
}: NavigationCardsProps) {
  const qc = useQueryClient();
  const [roomId, setRoomId] = useState("");
  const [userId, setUserId] = useState("");
  const [favoriteRooms, setFavoriteRooms] = useState<FavoriteRoom[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITE_ROOMS_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [favoriteUsers, setFavoriteUsers] = useState<FavoriteUser[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITE_USERS_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [showFavoriteModal, setShowFavoriteModal] = useState(false);
  const [favoriteRoomName, setFavoriteRoomName] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");

  const openRoom = useMutation({
    mutationFn: (roomId: string) => adbApi.openRoom(roomId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      onMessage("success", "已跳转");
    },
    onError: (err: Error) => onMessage("error", err.message),
  });

  const openChat = useMutation({
    mutationFn: (uid: string) => adbApi.openChat(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      onMessage("success", "已打开聊天");
    },
    onError: (err: Error) => onMessage("error", err.message),
  });

  const openUser = useMutation({
    mutationFn: (uid: string) => adbApi.openUser(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs"] });
      onMessage("success", "已打开主页");
    },
    onError: (err: Error) => onMessage("error", err.message),
  });

  const saveFavoriteRooms = (rooms: FavoriteRoom[]) => {
    setFavoriteRooms(rooms);
    localStorage.setItem(FAVORITE_ROOMS_KEY, JSON.stringify(rooms));
  };

  const saveFavoriteUsers = (users: FavoriteUser[]) => {
    setFavoriteUsers(users);
    localStorage.setItem(FAVORITE_USERS_KEY, JSON.stringify(users));
  };

  const addFavoriteRoom = () => {
    if (!roomId.trim()) {
      onMessage("warning", "请先输入房间 ID");
      return;
    }
    if (favoriteRooms.some((r) => r.id === roomId)) {
      onMessage("warning", "该房间已收藏");
      return;
    }
    setFavoriteRoomName(`房间${roomId}`);
    setShowFavoriteModal(true);
  };

  const confirmAddFavorite = () => {
    if (!favoriteRoomName.trim()) {
      onMessage("warning", "请输入房间名称");
      return;
    }
    saveFavoriteRooms([
      ...favoriteRooms,
      { id: roomId, name: favoriteRoomName },
    ]);
    onMessage("success", `已收藏: ${favoriteRoomName}`);
    setShowFavoriteModal(false);
    setFavoriteRoomName("");
  };

  const removeFavoriteRoom = (id: string) => {
    saveFavoriteRooms(favoriteRooms.filter((r) => r.id !== id));
  };

  const removeFavoriteUser = (id: string) => {
    saveFavoriteUsers(favoriteUsers.filter((u) => u.id !== id));
  };

  const confirmAddUser = () => {
    if (!newUserId.trim()) {
      onMessage("warning", "请输入用户 ID");
      return;
    }
    if (!newUserName.trim()) {
      onMessage("warning", "请输入用户名称");
      return;
    }
    if (favoriteUsers.some((u) => u.id === newUserId)) {
      onMessage("warning", "该用户已收藏");
      return;
    }
    saveFavoriteUsers([...favoriteUsers, { id: newUserId, name: newUserName }]);
    onMessage("success", `已收藏用户: ${newUserName}`);
    setShowUserModal(false);
  };

  if (!connected) return null;

  return (
    <>
      {/* 跳转房间 */}
      <Card size="small">
        <Flex vertical gap={8}>
          <Space.Compact className="w-full">
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
              aria-label="收藏房间"
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
                  icon={<StarFilled className="icon-warning" />}
                  closable
                  onClose={() => removeFavoriteRoom(room.id)}
                  className="favorite-card tag-no-margin"
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

      {/* 跳转用户聊天 */}
      <Card size="small">
        <Flex vertical gap={8}>
          <Space.Compact className="w-full">
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
                  onMessage("warning", "请先输入用户 ID");
                  return;
                }
                if (favoriteUsers.some((u) => u.id === userId)) {
                  onMessage("warning", "该用户已收藏");
                  return;
                }
                setNewUserId(userId);
                setNewUserName(`用户${userId}`);
                setShowUserModal(true);
              }}
              disabled={!userId || isRunning}
              title="收藏"
              aria-label="收藏用户"
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
                  icon={<UserOutlined className="icon-primary" />}
                  closable
                  onClose={() => removeFavoriteUser(user.id)}
                  className="favorite-card tag-no-margin"
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
    </>
  );
}
