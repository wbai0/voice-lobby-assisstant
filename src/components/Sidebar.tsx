import { useRef, useState, useEffect } from "react";
import {
  Layout,
  Input,
  Flex,
  Card,
  Button,
  Space,
  Typography,
  message,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  StarFilled,
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  HomeOutlined,
  LockOutlined,
} from "@ant-design/icons";
import "./Sidebar.css";
import "../styles/shared.css";

const { Sider } = Layout;
const { Text } = Typography;

const FAVORITE_ROOMS_KEY = "pico_favorite_rooms";
const FAVORITE_USERS_KEY = "pico_favorite_users";
const SIDEBAR_SPLIT_KEY = "pico_sidebar_split";

export interface FavoriteRoom {
  id: string;
  name: string;
}

export interface FavoriteUser {
  id: string;
  name: string;
}

interface SidebarProps {
  onRoomSelect: (roomId: string) => void;
  onUserChat: (userId: string) => void;
  onUserProfile: (userId: string) => void;
  onAddUser: () => void;
  canUseFavorites?: boolean; // 是否可以使用收藏功能
}

export function Sidebar({
  onRoomSelect,
  onUserChat,
  onUserProfile,
  onAddUser,
  canUseFavorites = false,
}: SidebarProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [searchText, setSearchText] = useState("");
  const [sidebarSplit, setSidebarSplit] = useState(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [favoriteRooms, setFavoriteRooms] = useState<FavoriteRoom[]>([]);
  const [favoriteUsers, setFavoriteUsers] = useState<FavoriteUser[]>([]);

  // Load from localStorage
  useEffect(() => {
    const savedRooms = localStorage.getItem(FAVORITE_ROOMS_KEY);
    const savedUsers = localStorage.getItem(FAVORITE_USERS_KEY);
    const savedSplit = localStorage.getItem(SIDEBAR_SPLIT_KEY);

    if (savedRooms) {
      try {
        const parsed = JSON.parse(savedRooms);
        if (Array.isArray(parsed)) setFavoriteRooms(parsed);
      } catch {}
    }
    if (savedUsers) {
      try {
        const parsed = JSON.parse(savedUsers);
        if (Array.isArray(parsed)) setFavoriteUsers(parsed);
      } catch {}
    }
    if (savedSplit) {
      const split = Number(savedSplit);
      if (!isNaN(split) && split >= 20 && split <= 80) setSidebarSplit(split);
    }
  }, []);

  const saveFavoriteRooms = (rooms: FavoriteRoom[]) => {
    setFavoriteRooms(rooms);
    localStorage.setItem(FAVORITE_ROOMS_KEY, JSON.stringify(rooms));
  };

  const saveFavoriteUsers = (users: FavoriteUser[]) => {
    setFavoriteUsers(users);
    localStorage.setItem(FAVORITE_USERS_KEY, JSON.stringify(users));
  };

  const removeFavoriteRoom = (id: string) => {
    saveFavoriteRooms(favoriteRooms.filter((r) => r.id !== id));
  };

  const removeFavoriteUser = (id: string) => {
    saveFavoriteUsers(favoriteUsers.filter((u) => u.id !== id));
  };

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

  const filteredRooms = favoriteRooms.filter(
    (r) =>
      !searchText ||
      r.name.toLowerCase().includes(searchText.toLowerCase()) ||
      r.id.includes(searchText)
  );

  const filteredUsers = favoriteUsers.filter(
    (u) =>
      !searchText ||
      u.name.toLowerCase().includes(searchText.toLowerCase()) ||
      u.id.includes(searchText)
  );

  return (
    <Sider
      width={220}
      className="sidebar"
      collapsible
      collapsedWidth={0}
      trigger={null}
    >
      {contextHolder}
      <div
        ref={sidebarRef}
        className={`sidebar-container ${isDraggingSplit ? "dragging" : ""}`}
        onMouseMove={isDraggingSplit ? handleSplitDrag : undefined}
        onMouseUp={isDraggingSplit ? handleSplitDragEnd : undefined}
        onMouseLeave={isDraggingSplit ? handleSplitDragEnd : undefined}
      >
        {/* 搜索框 */}
        <div className="sidebar-search">
          <Input
            size="small"
            placeholder="搜索房间/用户..."
            prefix={<SearchOutlined className="icon-muted" />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
        </div>

        {/* 收藏的房间 */}
        <div
          className="sidebar-section sidebar-section-rooms"
          style={{ height: `calc(${sidebarSplit}% - 24px)` }}
        >
          <Flex align="center" gap={6} className="sidebar-section-header">
            <StarFilled className="icon-warning" />
            <Text strong className="text-md">
              收藏房间
            </Text>
            <Text type="secondary" className="text-xs">
              ({filteredRooms.length}/{favoriteRooms.length})
            </Text>
            {!canUseFavorites && (
              <Tooltip title="高级会员功能">
                <LockOutlined className="icon-muted" />
              </Tooltip>
            )}
          </Flex>
          <div className="sidebar-section-content">
            {!canUseFavorites ? (
              <Text type="secondary" className="text-sm">
                <LockOutlined /> 升级高级会员解锁收藏功能
              </Text>
            ) : favoriteRooms.length > 0 ? (
              <Flex vertical gap={4}>
                {filteredRooms.map((room) => (
                  <Card
                    key={room.id}
                    size="small"
                    className="favorite-card"
                    styles={{ body: { padding: "8px 12px" } }}
                    onClick={() => {
                      onRoomSelect(room.id);
                    }}
                  >
                    <Flex justify="space-between" align="center">
                      <Flex vertical gap={2} className="favorite-card-content">
                        <Text className="favorite-name" ellipsis>
                          {room.name}
                        </Text>
                        <Text type="secondary" className="favorite-id">
                          ID:{" "}
                          <span
                            className="copyable"
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
                        aria-label="删除收藏房间"
                      />
                    </Flex>
                  </Card>
                ))}
              </Flex>
            ) : (
              <Text type="secondary" className="text-sm">
                暂无收藏，输入房间 ID 后点击 ⭐ 收藏
              </Text>
            )}
          </div>
        </div>

        {/* 分割条 */}
        <div
          className={`split-divider ${isDraggingSplit ? "active" : ""}`}
          onMouseDown={() => setIsDraggingSplit(true)}
        >
          <div className="split-divider-handle" />
        </div>

        {/* 收藏的用户 */}
        <div
          className="sidebar-section sidebar-section-users"
          style={{ height: `calc(${100 - sidebarSplit}% - 24px)` }}
        >
          <Flex
            align="center"
            justify="space-between"
            className="sidebar-section-header"
          >
            <Flex align="center" gap={6}>
              <UserOutlined className="icon-primary" />
              <Text strong className="text-md">
                收藏用户
              </Text>
              <Text type="secondary" className="text-xs">
                ({filteredUsers.length}/{favoriteUsers.length})
              </Text>
              {!canUseFavorites && (
                <Tooltip title="高级会员功能">
                  <LockOutlined className="icon-muted" />
                </Tooltip>
              )}
            </Flex>
            {canUseFavorites && (
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={onAddUser}
                aria-label="添加收藏用户"
              />
            )}
          </Flex>
          <div className="sidebar-section-content">
            {!canUseFavorites ? (
              <Text type="secondary" className="text-sm">
                <LockOutlined /> 升级高级会员解锁收藏功能
              </Text>
            ) : favoriteUsers.length > 0 ? (
              <Flex vertical gap={4}>
                {filteredUsers.map((user) => (
                  <Card
                    key={user.id}
                    size="small"
                    styles={{ body: { padding: "8px 12px" } }}
                  >
                    <Flex justify="space-between" align="center">
                      <Flex vertical gap={2} className="favorite-card-content">
                        <Text className="favorite-name" ellipsis>
                          {user.name}
                        </Text>
                        <Text type="secondary" className="favorite-id">
                          ID:{" "}
                          <span
                            className="copyable"
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
                          onClick={() => onUserChat(user.id)}
                          title="聊天"
                          aria-label="打开聊天"
                        />
                        <Button
                          type="text"
                          size="small"
                          icon={<HomeOutlined />}
                          onClick={() => onUserProfile(user.id)}
                          title="主页"
                          aria-label="打开主页"
                        />
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeFavoriteUser(user.id)}
                          title="删除"
                          aria-label="删除收藏用户"
                        />
                      </Space>
                    </Flex>
                  </Card>
                ))}
              </Flex>
            ) : (
              <Text type="secondary" className="text-sm">
                点击 + 添加收藏用户
              </Text>
            )}
          </div>
        </div>
      </div>
    </Sider>
  );
}
