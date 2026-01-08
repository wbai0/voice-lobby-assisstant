#!/bin/bash
# Test script to debug message sending

ADB="/opt/homebrew/bin/adb"
DEVICE="127.0.0.1:16384"

echo "=== Testing ADB connection ==="
$ADB devices

echo ""
echo "=== Step 1: Dump UI ==="
$ADB -s $DEVICE shell uiautomator dump /sdcard/ui.xml
echo "Dump result: $?"

echo ""
echo "=== Step 2: Read UI XML ==="
XML=$($ADB -s $DEVICE shell cat /sdcard/ui.xml)
echo "XML length: ${#XML}"

echo ""
echo "=== Step 3: Find input field (etInput) ==="
echo "$XML" | grep -o 'resource-id="com.pico.live:id/etInput"[^>]*bounds="[^"]*"' | head -1

echo ""
echo "=== Step 4: Find send button (tvSend) ==="
echo "$XML" | grep -o 'resource-id="com.pico.live:id/tvSend"[^>]*bounds="[^"]*"' | head -1

echo ""
echo "=== Step 5: Extract input field coordinates ==="
INPUT_BOUNDS=$(echo "$XML" | grep -o 'resource-id="com.pico.live:id/etInput"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | sed 's/bounds="//;s/"$//')
echo "Input bounds: $INPUT_BOUNDS"

if [ -n "$INPUT_BOUNDS" ]; then
    X1=$(echo "$INPUT_BOUNDS" | sed 's/\[\([0-9]*\),.*/\1/')
    Y1=$(echo "$INPUT_BOUNDS" | sed 's/\[[0-9]*,\([0-9]*\)\].*/\1/')
    X2=$(echo "$INPUT_BOUNDS" | sed 's/.*\]\[\([0-9]*\),.*/\1/')
    Y2=$(echo "$INPUT_BOUNDS" | sed 's/.*,\([0-9]*\)\]$/\1/')
    CX=$(( (X1 + X2) / 2 ))
    CY=$(( (Y1 + Y2) / 2 ))
    echo "Input center: ($CX, $CY)"
    
    echo ""
    echo "=== Step 6: Tap input field ==="
    $ADB -s $DEVICE shell input tap $CX $CY
    echo "Tap result: $?"
    sleep 0.3
    
    echo ""
    echo "=== Step 7: Input text ==="
    $ADB -s $DEVICE shell input text "test123"
    echo "Input result: $?"
    sleep 0.3
    
    echo ""
    echo "=== Step 8: Re-dump UI for send button ==="
    $ADB -s $DEVICE shell uiautomator dump /sdcard/ui.xml
    XML2=$($ADB -s $DEVICE shell cat /sdcard/ui.xml)
    
    echo ""
    echo "=== Step 9: Find send button again ==="
    SEND_BOUNDS=$(echo "$XML2" | grep -o 'resource-id="com.pico.live:id/tvSend"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | sed 's/bounds="//;s/"$//')
    echo "Send bounds: $SEND_BOUNDS"
    
    if [ -n "$SEND_BOUNDS" ]; then
        SX1=$(echo "$SEND_BOUNDS" | sed 's/\[\([0-9]*\),.*/\1/')
        SY1=$(echo "$SEND_BOUNDS" | sed 's/\[[0-9]*,\([0-9]*\)\].*/\1/')
        SX2=$(echo "$SEND_BOUNDS" | sed 's/.*\]\[\([0-9]*\),.*/\1/')
        SY2=$(echo "$SEND_BOUNDS" | sed 's/.*,\([0-9]*\)\]$/\1/')
        SCX=$(( (SX1 + SX2) / 2 ))
        SCY=$(( (SY1 + SY2) / 2 ))
        echo "Send center: ($SCX, $SCY)"
        
        echo ""
        echo "=== Step 10: Tap send button ==="
        $ADB -s $DEVICE shell input tap $SCX $SCY
        echo "Tap result: $?"
    else
        echo "ERROR: Send button not found!"
    fi
else
    echo "ERROR: Input field not found!"
fi

echo ""
echo "=== Done ==="
