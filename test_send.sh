#!/bin/bash
# 测试发消息逻辑 - 模拟 Rust 代码中的 send_item 函数

DEVICE="127.0.0.1:16384"
ADB="adb"

echo "=== 测试发消息逻辑 ==="
echo "设备: $DEVICE"
echo ""

# 检查设备连接
echo "1. 检查设备连接..."
$ADB devices
echo ""

# 测试 tap_by_id 逻辑 - 获取 UI 层级并解析
test_tap_by_id() {
    local resource_id=$1
    echo "2. 测试 tap_by_id: $resource_id"
    
    # Dump UI hierarchy
    $ADB -s $DEVICE shell uiautomator dump /sdcard/ui.xml 2>/dev/null
    
    # Read and parse bounds
    local xml=$($ADB -s $DEVICE shell cat /sdcard/ui.xml 2>/dev/null)
    
    # 查找 resource-id 并提取 bounds
    local bounds=$(echo "$xml" | grep -o "resource-id=\"$resource_id\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" | head -1)
    
    if [ -z "$bounds" ]; then
        echo "   ❌ 找不到元素: $resource_id"
        return 1
    fi
    
    # 提取坐标
    local coords=$(echo "$bounds" | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | sed 's/bounds="//;s/"$//')
    echo "   找到元素, bounds: $coords"
    
    # 解析坐标 [x1,y1][x2,y2]
    local x1=$(echo "$coords" | sed 's/\[\([0-9]*\),.*/\1/')
    local y1=$(echo "$coords" | sed 's/\[[0-9]*,\([0-9]*\)\].*/\1/')
    local x2=$(echo "$coords" | sed 's/.*\]\[\([0-9]*\),.*/\1/')
    local y2=$(echo "$coords" | sed 's/.*,\([0-9]*\)\]$/\1/')
    
    # 计算中心点
    local center_x=$(( (x1 + x2) / 2 ))
    local center_y=$(( (y1 + y2) / 2 ))
    
    echo "   中心点: ($center_x, $center_y)"
    echo "   执行点击..."
    $ADB -s $DEVICE shell input tap $center_x $center_y
    echo "   ✅ 点击完成"
    return 0
}

# 测试输入文字
test_input_text() {
    local text=$1
    echo "3. 测试输入文字: $text"
    $ADB -s $DEVICE shell input text "$text"
    echo "   ✅ 输入完成"
}

# 完整测试流程
echo "=== 开始完整测试流程 ==="
echo ""

# Step 1: 点击输入框
test_tap_by_id "com.pico.live:id/etInput"
sleep 0.3

# Step 2: 输入文字
test_input_text "test_script_$(date +%H%M%S)"
sleep 0.4

# Step 3: 点击发送按钮
test_tap_by_id "com.pico.live:id/tvSend"
sleep 0.5

echo ""
echo "=== 测试完成 ==="
