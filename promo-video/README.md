# claude-code-zh-cn Promo Video

Remotion 宣传动画工程，用于展示 `claude-code-zh-cn` 的安装体验、中文化效果、支持边界和自动修复能力。

## 输出

- 成片：`out/claude-code-zh-cn-promo.mp4`
- 竖版短片：`out/claude-code-zh-cn-promo-short-vertical.mp4`
- 分辨率：1920 x 1080
- 帧率：30 fps
- 横版时长：约 41.6 秒
- 竖版时长：15 秒
- 音频：项目内原创合成背景音 + 轻提示音，素材位于 `public/assets/audio/`

## 本地预览

```bash
npm install
npm run dev
```

## 重新渲染

```bash
npm run render
npm run render:short
```

## 主视觉

`public/assets/localization-key-visual.png` 使用生图模型生成，视频中的准确中文文案由 Remotion 代码渲染，避免图片模型生成乱码文字。
