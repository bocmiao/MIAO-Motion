export function setupPlatformGuide() {
  const select = document.getElementById('live-platform') as HTMLSelectElement;
  const list = document.getElementById('platform-steps')!;
  const update = () => {
    const target = select.selectedOptions[0]!.textContent!;
    const steps = select.value === 'obs' ? [
      '先让角色出现在喵动中，再进入绿幕直播画面。',
      '在 OBS 添加窗口捕获，选择喵动窗口，添加绿色色度键；也可展开下方“自动配置 OBS”。',
      '检查角色取景和麦克风，先录制一段预览。',
    ] : [
      `打开${target}的电脑客户端，并确认账号具有所需权限。`,
      '安装版可试用原生虚拟摄像头：安装组件、开始输出，再在平台摄像头列表选择 MIAO Motion Camera。此路线为实验功能，需管理员安装，限兼容的 64 位接收端。',
      select.value === 'meeting' ? '便携版或无法识别时：喵动 → OBS 窗口捕获与背景 → 启动 OBS 虚拟摄像头 → 在会议中选择 OBS Virtual Camera。' : '便携版或无法识别时：在直播软件添加喵动窗口捕获并抠绿幕；有官方推流权限时也可通过 OBS 推流。',
      ...(select.value === 'xiaohongshu' ? ['小红书账号是否可使用电脑工具或推流，以官方提供的入口为准；手机 App 不能直接选电脑虚拟摄像头。'] : []),
      '麦克风需在接收软件单独选择；先检查接收画面，再开播或入会。',
    ];
    list.replaceChildren(...steps.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  };
  select.addEventListener('change', update); update();
}
