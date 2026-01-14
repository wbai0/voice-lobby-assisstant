import { Flex, Input, InputNumber, Button, Typography } from "antd";
import {
  DeleteOutlined,
  PictureOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const { Text } = Typography;

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "photo"; index: number };

export type ContentItemWithId = ContentItem & { id: string };

interface SortableMessageItemProps {
  item: ContentItemWithId;
  isRunning: boolean;
  onUpdate: (data: Partial<ContentItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export function SortableMessageItem({
  item,
  isRunning,
  onUpdate,
  onRemove,
  canRemove,
}: SortableMessageItemProps) {
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
            aria-label="删除此项"
          />
        )}
      </Flex>
    </div>
  );
}
