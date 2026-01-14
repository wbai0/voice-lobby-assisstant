#!/bin/bash
# 分析 App 的 router scheme
# 用法: ./analyze_router.sh

ADB="/opt/homebrew/bin/adb"
DEVICE="127.0.0.1:16384"
PACKAGE="com.pico.live"
TEMP_DIR="/tmp/pico_analysis"

echo "=== App Router Scheme 分析 ==="
echo ""

# 检查设备连接
echo "1. 检查设备连接..."
$ADB devices
if ! $ADB -s $DEVICE shell echo "connected" 2>/dev/null | grep -q "connected"; then
    echo "❌ 设备未连接，尝试连接..."
    $ADB connect $DEVICE
    sleep 1
fi
echo ""

# 创建临时目录
mkdir -p $TEMP_DIR
cd $TEMP_DIR

# 获取 APK 路径
echo "2. 获取 APK 路径..."
APK_PATH=$($ADB -s $DEVICE shell pm path $PACKAGE | head -1 | sed 's/package://' | tr -d '\r')
echo "   APK 路径: $APK_PATH"
echo ""

# 拉取 APK
echo "3. 拉取 APK (可能需要一些时间)..."
$ADB -s $DEVICE pull "$APK_PATH" base.apk 2>/dev/null
if [ ! -f base.apk ]; then
    echo "❌ 无法拉取 APK"
    exit 1
fi
echo "   ✅ APK 已拉取"
echo ""

# 解压 APK
echo "4. 解压 APK..."
unzip -q -o base.apk -d apk_contents 2>/dev/null
echo "   ✅ 解压完成"
echo ""

# 分析 AndroidManifest.xml (需要 aapt 或 apktool)
echo "5. 分析 AndroidManifest.xml..."
if command -v aapt &> /dev/null; then
    echo "   使用 aapt 分析..."
    aapt dump xmltree base.apk AndroidManifest.xml 2>/dev/null | grep -E "scheme|host|path" > manifest_schemes.txt
    cat manifest_schemes.txt
elif command -v aapt2 &> /dev/null; then
    echo "   使用 aapt2 分析..."
    aapt2 dump xmltree base.apk --file AndroidManifest.xml 2>/dev/null | grep -E "scheme|host|path" > manifest_schemes.txt
    cat manifest_schemes.txt
else
    echo "   ⚠️ aapt 未安装，跳过 manifest 分析"
fi
echo ""

# 搜索 dex 文件中的 router 字符串
echo "6. 搜索 router:// 相关字符串..."
echo ""
echo "=== 找到的 Router Schemes ==="

# 使用 strings 命令搜索所有 dex 文件
for dex in apk_contents/*.dex; do
    if [ -f "$dex" ]; then
        strings "$dex" 2>/dev/null | grep -oE 'router://[a-zA-Z0-9_/?=&]+' | sort -u
    fi
done | sort -u | tee router_schemes.txt

echo ""
echo "=== 找到的其他 Deep Link Schemes ==="
for dex in apk_contents/*.dex; do
    if [ -f "$dex" ]; then
        # 搜索其他可能的 scheme
        strings "$dex" 2>/dev/null | grep -oE '(pico|picolive)://[a-zA-Z0-9_/?=&]+' | sort -u
    fi
done | sort -u

echo ""
echo "=== 搜索可能的路由关键词 ==="
for dex in apk_contents/*.dex; do
    if [ -f "$dex" ]; then
        strings "$dex" 2>/dev/null | grep -iE 'open(Room|Chat|Profile|User|Live|Gift|Wallet|Setting|Search|Topic|Activity|Event|Game|Match|Party|Voice|Video|Call|Message|Notification|Home|Discover|Explore|Feed|Story|Moment|Post|Comment|Like|Follow|Share|Report|Block|Mute|Ban|Kick|Invite|Join|Leave|Create|Delete|Edit|Update|Upload|Download|Play|Pause|Stop|Start|End|Begin|Finish|Complete|Cancel|Confirm|Submit|Send|Receive|Accept|Reject|Approve|Deny|Allow|Forbid|Enable|Disable|Show|Hide|Display|Render|Load|Refresh|Reload|Retry|Reset|Clear|Clean|Remove|Add|Insert|Append|Prepend|Replace|Swap|Move|Copy|Paste|Cut|Undo|Redo|Save|Restore|Backup|Sync|Import|Export|Convert|Transform|Translate|Encode|Decode|Encrypt|Decrypt|Compress|Decompress|Zip|Unzip|Pack|Unpack|Serialize|Deserialize|Parse|Format|Validate|Verify|Check|Test|Debug|Log|Print|Trace|Monitor|Track|Record|Capture|Snapshot|Screenshot|Screencast|Stream|Broadcast|Publish|Subscribe|Listen|Watch|Observe|Notify|Alert|Warn|Error|Info|Success|Fail|Timeout|Retry|Abort|Exit|Quit|Close|Shutdown|Restart|Reboot|Initialize|Setup|Configure|Customize|Personalize|Optimize|Improve|Enhance|Upgrade|Downgrade|Install|Uninstall|Register|Unregister|Login|Logout|Signin|Signout|Signup|Authenticate|Authorize|Deauthorize|Grant|Revoke|Request|Response|Callback|Hook|Trigger|Fire|Emit|Dispatch|Handle|Process|Execute|Run|Call|Invoke|Apply|Bind|Unbind|Connect|Disconnect|Attach|Detach|Mount|Unmount|Link|Unlink|Associate|Dissociate|Relate|Unrelate|Map|Unmap|Route|Navigate|Redirect|Forward|Back|Previous|Next|First|Last|Top|Bottom|Left|Right|Up|Down|In|Out|Enter|Exit|Push|Pop|Shift|Unshift|Enqueue|Dequeue|Stack|Queue|List|Array|Set|Map|Object|Class|Instance|Prototype|Constructor|Destructor|Getter|Setter|Method|Function|Procedure|Routine|Subroutine|Callback|Handler|Listener|Observer|Subscriber|Publisher|Producer|Consumer|Provider|Injector|Factory|Builder|Creator|Generator|Iterator|Reducer|Filter|Mapper|Sorter|Comparator|Validator|Formatter|Parser|Serializer|Deserializer|Encoder|Decoder|Encryptor|Decryptor|Compressor|Decompressor|Zipper|Unzipper|Packer|Unpacker)' 2>/dev/null | head -50
    fi
done | sort -u

echo ""
echo "=== 搜索 URL 参数模式 ==="
for dex in apk_contents/*.dex; do
    if [ -f "$dex" ]; then
        # 搜索类似 ?xxx= 或 &xxx= 的参数模式
        strings "$dex" 2>/dev/null | grep -oE '\?(room_id|uid|user_id|id|type|action|from|to|source|target|ref|callback|redirect|url|path|page|tab|index|offset|limit|count|size|width|height|quality|format|mode|style|theme|lang|locale|currency|timezone|timestamp|token|key|secret|sign|signature|hash|code|state|nonce|scope|grant|access|refresh|expire|ttl|duration|delay|interval|timeout|retry|max|min|default|fallback|backup|primary|secondary|main|sub|parent|child|root|leaf|head|tail|start|end|begin|finish|open|close|show|hide|enable|disable|active|inactive|visible|invisible|selected|unselected|checked|unchecked|expanded|collapsed|focused|blurred|hovered|pressed|released|dragged|dropped|scrolled|zoomed|rotated|scaled|translated|transformed|animated|transitioned|faded|slided|bounced|shaked|pulsed|spinned|flipped|folded|unfolded|wrapped|unwrapped|clipped|masked|filtered|sorted|grouped|merged|splitted|joined|concatenated|trimmed|padded|aligned|justified|centered|distributed|spaced|gapped|margined|bordered|rounded|shadowed|elevated|highlighted|underlined|striked|italicized|bolded|colored|tinted|shaded|grayed|blurred|sharpened|brightened|darkened|contrasted|saturated|desaturated|inverted|negated|sepia|grayscale|monochrome|duotone|gradient|pattern|texture|image|icon|logo|avatar|thumbnail|preview|placeholder|skeleton|loading|spinner|progress|indicator|badge|chip|tag|label|title|subtitle|caption|description|summary|detail|content|body|header|footer|sidebar|navbar|toolbar|tabbar|menubar|statusbar|actionbar|appbar|bottombar|topbar|leftbar|rightbar|drawer|modal|dialog|popup|tooltip|toast|snackbar|banner|alert|notification|message|chat|comment|reply|thread|conversation|discussion|forum|board|channel|room|group|team|organization|company|business|enterprise|startup|agency|studio|lab|workshop|academy|school|university|college|institute|center|hub|space|place|location|address|city|country|region|area|zone|district|neighborhood|street|road|avenue|boulevard|highway|freeway|expressway|motorway|railway|subway|metro|bus|tram|taxi|uber|lyft|grab|gojek|ola|didi|bolt|yandex|careem|cabify|mytaxi|hailo|gett|curb|via|juno|wingz|ztrip|fasten|flywheel|summon|sidecar|shuddle|chariot|bridj|split|scoop|waze|google|apple|microsoft|amazon|facebook|twitter|instagram|snapchat|tiktok|youtube|netflix|spotify|uber|airbnb|booking|expedia|tripadvisor|yelp|foursquare|swarm|untappd|vivino|delectable|cellartracker|wine|beer|cocktail|drink|food|restaurant|cafe|bar|pub|club|lounge|hotel|hostel|motel|resort|villa|apartment|house|home|office|workplace|coworking|meeting|conference|event|party|wedding|birthday|anniversary|graduation|reunion|gathering|celebration|festival|concert|show|performance|exhibition|gallery|museum|theater|cinema|movie|film|video|audio|music|song|album|playlist|podcast|radio|tv|news|magazine|newspaper|blog|article|post|story|photo|image|picture|graphic|illustration|drawing|painting|sketch|design|art|craft|diy|tutorial|guide|howto|tip|trick|hack|shortcut|cheatsheet|reference|documentation|manual|handbook|book|ebook|audiobook|course|class|lesson|lecture|seminar|webinar|workshop|training|coaching|mentoring|consulting|advising|counseling|therapy|healing|wellness|fitness|health|medical|dental|optical|pharmacy|hospital|clinic|doctor|nurse|patient|appointment|schedule|calendar|reminder|alarm|timer|clock|watch|time|date|day|week|month|year|decade|century|millennium|era|age|period|season|quarter|semester|term|cycle|phase|stage|step|level|tier|rank|grade|score|point|credit|debit|balance|amount|total|subtotal|tax|fee|charge|cost|price|value|worth|budget|expense|income|revenue|profit|loss|gain|return|yield|dividend|interest|rate|percentage|ratio|fraction|decimal|integer|number|digit|character|letter|word|sentence|paragraph|section|chapter|part|volume|edition|version|release|update|patch|fix|bug|issue|problem|error|warning|info|debug|trace|log|report|analytics|statistics|metrics|kpi|dashboard|chart|graph|table|list|grid|card|tile|item|element|component|widget|module|plugin|extension|addon|theme|skin|template|layout|style|css|html|xml|json|yaml|toml|ini|env|config|setting|option|preference|parameter|argument|variable|constant|property|attribute|field|column|row|cell|header|footer|body|content|data|info|meta|schema|model|entity|object|class|interface|type|enum|struct|union|tuple|array|list|set|map|dict|hash|tree|graph|node|edge|vertex|link|connection|relation|association|dependency|reference|pointer|handle|descriptor|identifier|name|label|title|description|summary|detail|note|comment|annotation|tag|category|group|collection|bundle|package|module|library|framework|sdk|api|service|server|client|agent|proxy|gateway|router|switch|hub|bridge|tunnel|vpn|firewall|loadbalancer|cache|queue|stack|heap|pool|buffer|stream|pipe|channel|socket|port|host|domain|subdomain|path|route|endpoint|url|uri|urn|link|href|src|dest|origin|target|source|sink|input|output|request|response|header|body|payload|content|data|form|field|param|query|fragment|hash|anchor|bookmark|favorite|star|like|love|heart|thumb|vote|rate|review|feedback|comment|reply|share|forward|retweet|repost|reblog|quote|mention|tag|hashtag|at|dm|pm|im|sms|mms|email|mail|inbox|outbox|sent|draft|trash|spam|archive|folder|label|filter|search|find|lookup|query|browse|explore|discover|recommend|suggest|autocomplete|autofill|predict|guess|estimate|calculate|compute|process|analyze|evaluate|assess|measure|count|sum|average|median|mode|min|max|range|variance|deviation|correlation|regression|classification|clustering|segmentation|detection|recognition|identification|verification|authentication|authorization|permission|role|privilege|access|control|security|privacy|encryption|decryption|hashing|signing|verification|validation|sanitization|escaping|encoding|decoding|compression|decompression|serialization|deserialization|marshalling|unmarshalling|parsing|formatting|rendering|displaying|showing|hiding|toggling|switching|changing|updating|modifying|editing|creating|deleting|removing|adding|inserting|appending|prepending|replacing|swapping|moving|copying|pasting|cutting|undoing|redoing|saving|loading|importing|exporting|uploading|downloading|streaming|buffering|caching|prefetching|preloading|lazy|eager|sync|async|parallel|concurrent|sequential|serial|batch|bulk|single|multiple|all|none|some|any|every|each|first|last|next|previous|current|default|custom|standard|special|normal|abnormal|regular|irregular|valid|invalid|correct|incorrect|right|wrong|true|false|yes|no|on|off|enabled|disabled|active|inactive|visible|hidden|shown|collapsed|expanded|selected|deselected|checked|unchecked|focused|blurred|hovered|pressed|released|dragged|dropped|scrolled|zoomed|rotated|scaled|translated|transformed|animated|transitioned)=' 2>/dev/null | head -30
    fi
done | sort -u

echo ""
echo "=== 结果已保存到 ==="
echo "   $TEMP_DIR/router_schemes.txt"
echo ""

# 清理
# rm -rf $TEMP_DIR

echo "完成!"
