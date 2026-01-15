import { useState } from "react";
import { Layout, Card, Flex, Form, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../useAuth";
import "./LoginForm.css";
import "../styles/shared.css";

const { Content } = Layout;
const { Text } = Typography;

import { Typography } from "antd";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { signIn, signUp } = useAuth();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: { email: string; password: string }) => {
    setLoading(true);
    const { error } = isRegister
      ? await signUp(values.email, values.password)
      : await signIn(values.email, values.password);
    setLoading(false);

    if (error) {
      messageApi.error(error.message);
    } else if (isRegister) {
      messageApi.success("注册成功，请查收验证邮件");
    } else {
      messageApi.success("登录成功");
      onSuccess();
    }
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
              Pico Assistant
            </Text>
            <Form
              form={form}
              onFinish={handleSubmit}
              style={{ width: "100%" }}
              layout="vertical"
            >
              <Form.Item
                name="email"
                rules={[
                  { required: true, type: "email", message: "请输入有效邮箱" },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="邮箱"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                rules={[{ required: true, min: 6, message: "密码至少6位" }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  size="large"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 8 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  size="large"
                >
                  {isRegister ? "注册" : "登录"}
                </Button>
              </Form.Item>
            </Form>
            <Button type="link" onClick={() => setIsRegister(!isRegister)}>
              {isRegister ? "已有账号？去登录" : "没有账号？去注册"}
            </Button>
          </Flex>
        </Card>
      </Content>
    </Layout>
  );
}
