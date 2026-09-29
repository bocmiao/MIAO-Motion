const WINDOW_CAPTURE = '推荐：喵动背景切到绿幕并进入直播画面，在直播软件添加窗口类素材（窗口捕获/窗口采集）选择喵动窗口，再用绿幕抠图选绿色。喵动窗口不要最小化。';
const NATIVE_CAMERA = '安装版可试（实验）：展开“原生虚拟摄像头（Windows）”，安装组件后先点“开始虚拟摄像头输出”，再在软件的摄像头列表选择 MIAO Motion Camera；看不到时重新选择或重开软件。仅 64 位软件，640×360，无透明背景。';
const RTMP = '账号有官方推流地址和密钥时，也可用 OBS 推流：OBS“设置 → 直播”分别填入地址和密钥。密钥不要公开。';
const PORTRAIT = '竖屏：喵动“输出比例”选 9:16；用 OBS 时在“设置 → 视频”把画布和输出分辨率都设为 1080x1920。';
const PHONE_APP = '手机 App 不能直接选择电脑的虚拟摄像头，请使用平台的电脑端开播工具或推流码。';
const MICROPHONE = '麦克风需在接收软件里单独选择；先检查预览或录一段，再开播或入会。';
const menuNote = (name: string) => `打开${name}，确认账号可以开播。菜单名称以当前版本为准。`;

const guides: Record<string, string[]> = {
  obs: [
    '先让角色出现在喵动中，再进入绿幕直播画面。',
    '在 OBS 添加“窗口捕获”，选择喵动窗口，右键来源 → 滤镜 → 添加绿色“色度键”；也可展开下方“自动配置 OBS（Windows）”一键创建“喵动 · 绿幕角色”场景。',
    '检查角色取景和麦克风，先录制一段预览；直播时按平台推流码在 OBS 开始直播。',
  ],
  bilibili: [menuNote('B站直播姬'), WINDOW_CAPTURE, NATIVE_CAMERA, 'B 站通常在网页直播中心提供推流地址和密钥（以当前页面为准），有权限时也可用 OBS 推流。', MICROPHONE],
  douyin: [menuNote('抖音直播伴侣'), '推荐：用“添加直播画面 → 窗口”这类窗口采集方式选择喵动绿幕窗口，再用绿幕抠图。找不到窗口时把喵动切到前台再刷新。', NATIVE_CAMERA, PORTRAIT, PHONE_APP, MICROPHONE],
  kuaishou: [menuNote('快手直播伴侣'), WINDOW_CAPTURE, NATIVE_CAMERA, PORTRAIT, RTMP, MICROPHONE],
  shipinhao: [
    '视频号电脑端一般通过网页“视频号助手”的直播功能获取推流地址和密钥（以当前页面为准）；直播资格以微信官方规则为准。',
    '在 OBS“设置 → 视频”把画布和输出分辨率都设为 1080x1920，喵动“输出比例”选 9:16。',
    'OBS 添加“窗口捕获”选择喵动绿幕窗口并加绿色“色度键”，或用下方“自动配置 OBS（Windows）”。',
    '把推流地址和密钥填入 OBS“设置 → 直播”，开始推流后回到视频号助手确认画面，再按页面提示开播。',
    '手机微信里直接开播无法选择电脑的虚拟摄像头。',
    MICROPHONE,
  ],
  xiaohongshu: [
    '先在小红书官方开播入口确认账号能否使用电脑开播工具或推流，以官方当前提供的入口为准。',
    '电脑工具有“窗口”来源时，捕获喵动绿幕窗口并抠绿；有“摄像头”来源时，安装版可试 MIAO Motion Camera（实验）。',
    '获得官方推流地址和密钥后，可用 OBS 推流；竖屏把 OBS 画布设为 1080x1920，喵动选 9:16。',
    '小红书手机 App 不能直接选电脑虚拟摄像头。',
    MICROPHONE,
  ],
  huya: [menuNote('虎牙的电脑开播工具'), WINDOW_CAPTURE, NATIVE_CAMERA, RTMP, MICROPHONE],
  douyu: [menuNote('斗鱼的电脑开播工具'), WINDOW_CAPTURE, NATIVE_CAMERA, RTMP, MICROPHONE],
  meeting: [
    '安装版可试（实验）：喵动点“开始虚拟摄像头输出”，再在会议软件的摄像头设置里选择 MIAO Motion Camera；看不到时重新选择或重开会议软件。',
    '便携版或无法识别时：OBS 窗口捕获喵动并抠绿幕，在角色下方放背景 → OBS 点“启动虚拟摄像机” → 会议里选择 OBS Virtual Camera。',
    '虚拟摄像头没有透明背景；会议软件的本地预览常会镜像显示，请以对方看到的画面为准。',
    MICROPHONE,
  ],
  rtmp: [
    '在平台开播后台或电脑开播工具里查找“推流/第三方推流”入口，获得服务器地址和推流密钥；没有入口说明账号暂未开通，喵动无法绕过。',
    'OBS 添加“窗口捕获”选择喵动绿幕窗口并加绿色“色度键”，或用下方“自动配置 OBS（Windows）”。',
    'OBS“设置 → 直播”：服务选“自定义”或平台名称，分别填入地址和密钥。密钥相当于开播密码，不要截图公开。',
    '先预览或录制检查，再开始推流；喵动不会替你开始直播。',
  ],
};

export function setupPlatformGuide() {
  const select = document.getElementById('live-platform') as HTMLSelectElement;
  const list = document.getElementById('platform-steps')!;
  const update = () => {
    const steps = guides[select.value] ?? guides.obs!;
    list.replaceChildren(...steps.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  };
  select.addEventListener('change', update); update();
}
