import { useState, useEffect } from "react";
import { Card, Flex, Tag, Space, Button, Dropdown, Popconfirm } from "antd";
import { PlusOutlined, SaveOutlined } from "@ant-design/icons";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { nanoid } from "nanoid";
import { SortableMessageItem } from "./SortableMessageItem";
import type { ContentItem, ContentItemWithId } from "./SortableMessageItem";
import "./MessageEditor.css";
import "../styles/shared.css";

const TEMPLATES_KEY = "pico_templates_v2";
const DEFAULT_TEMPLATE_KEY = "pico_default_template";

interface Template {
  name: string;
  items: ContentItem[];
}

const withIds = (items: ContentItem[]): ContentItemWithId[] =>
  items.map((item) => ({ ...item, id: nanoid() }));

interface MessageEditorProps {
  isRunning: boolean;
  onItemsChange: (items: ContentItemWithId[]) => void;
  onMessage: (type: "success" | "error" | "warning", msg: string) => void;
}

export function MessageEditor({
  isRunning,
  onItemsChange,
  onMessage,
}: MessageEditorProps) {
  const [items, setItems] = useState<ContentItemWithId[]>(() =>
    withIds([{ type: "text", content: "" }])
  );
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [defaultTemplate, setDefaultTemplate] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load templates from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(TEMPLATES_KEY);
    const defaultName = localStorage.getItem(DEFAULT_TEMPLATE_KEY) || "";
    setDefaultTemplate(defaultName);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setTemplates(parsed);
          if (defaultName) {
            const t = parsed.find((t: Template) => t.name === defaultName);
            if (t) {
              const newItems = withIds(t.items);
              setItems(newItems);
              setSelectedTemplate(defaultName);
              onItemsChange(newItems);
            }
          }
        }
      } catch {}
    }
  }, []);

  // Notify parent when items change
  useEffect(() => {
    onItemsChange(items);
  }, [items, onItemsChange]);

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

  const saveTemplates = (t: Template[]) => {
    setTemplates(t);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
  };

  const setAsDefault = (name: string) => {
    setDefaultTemplate(name);
    localStorage.setItem(DEFAULT_TEMPLATE_KEY, name);
    onMessage("success", `默认: ${name}`);
  };

  const saveAsNewTemplate = () => {
    const name = prompt("模板名称", `模板${templates.length + 1}`);
    if (!name) return;
    saveTemplates([
      ...templates.filter((t) => t.name !== name),
      { name, items: items.map(({ id, ...rest }) => rest) },
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

  return (
    <Card
      size="small"
      title={
        <Flex align="center" gap={6}>
          <span>消息</span>
          {selectedTemplate && (
            <Tag color="blue" className="tag-no-margin">
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
                          className="template-menu-item"
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
            aria-label="保存为新模板"
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
  );
}

export function getItemsForSubmit(items: ContentItemWithId[]): ContentItem[] {
  return items.map(({ id, ...rest }) => rest);
}
