import { useState } from "react";
import {
  Layout,
  Card,
  Flex,
  Form,
  Input,
  Button,
  message,
  Typography,
} from "antd";
import { UserOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "../useAuth";
import "./LoginForm.css";
import "../styles/shared.css";

const { Content } = Layout;
const { Text } = Typography;

interface LoginFormProps {
  onSuccess: () => void;
}

type FormMode = "email" | "otp";

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { sendOtp, verifyOtp } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<FormMode>("email");
  const [email, setEmail] = useState("");
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email?: string; otp?: string }) => {
    setLoading(true);

    try {
      if (mode === "email") {
        const { error } = await sendOtp(values.email!);
        if (error) {
          messageApi.error(error.message);
        } else {
          messageApi.success("验证码已发送到邮箱");
          setEmail(values.email!);
          setMode("otp");
          form.resetFields();
        }
      } else {
        const { error } = await verifyOtp(email, values.otp!);
        if (error) {
          messageApi.error(error.message);
        } else {
          messageApi.success("登录成功");
          onSuccess();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const resetToEmail = () => {
    setMode("email");
    setEmail("");
    form.resetFields();
  };

  return (
    <Layout style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      {contextHolder}
      <Content
        style={{
          padding: 16,
          maxWidth: 360,
          margin: "auto",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Card style={{ width: "100%" }}>
          <Flex vertical gap={16} align="center">
            <Text strong style={{ fontSize: 20 }}>
              语音厅工具箱
            </Text>
            <Text type="secondary" style={{ fontSize: 14 }}>
              {mode === "email" ? "输入邮箱获取验证码" : "输入验证码登录"}
            </Text>
            <Form
              form={form}
              onFinish={handleSubmit}
              style={{ width: "100%" }}
              layout="vertical"
            >
              {mode === "email" && (
                <Form.Item
                  name="email"
                  rules={[
                    {
                      required: true,
                      type: "email",
                      message: "请输入有效邮箱",
                    },
                  ]}
                >
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="邮箱"
                    size="large"
                  />
                </Form.Item>
              )}
              {mode === "otp" && (
                <>
                  <Text
                    type="secondary"
                    style={{
                      display: "block",
                      marginBottom: 16,
                      textAlign: "center",
                    }}
                  >
                    验证码已发送至 {email}
                  </Text>
                  <Form.Item
                    name="otp"
                    rules={[{ required: true, message: "请输入验证码" }]}
                  >
                    <Input
                      prefix={<MailOutlined />}
                      placeholder="8位验证码"
                      size="large"
                      maxLength={8}
                    />
                  </Form.Item>
                </>
              )}
              <Form.Item style={{ marginBottom: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  {mode === "email" ? "获取验证码" : "登录"}
                </Button>
              </Form.Item>
            </Form>
            {mode === "otp" && (
              <Flex gap={16}>
                <Button type="link" onClick={resetToEmail}>
                  更换邮箱
                </Button>
                <Button
                  type="link"
                  onClick={async () => {
                    setLoading(true);
                    const { error } = await sendOtp(email);
                    setLoading(false);
                    if (error) {
                      messageApi.error(error.message);
                    } else {
                      messageApi.success("验证码已重新发送");
                    }
                  }}
                  disabled={loading}
                >
                  重新发送
                </Button>
              </Flex>
            )}
          </Flex>
        </Card>
      </Content>
    </Layout>
  );
}
