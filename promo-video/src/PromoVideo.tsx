import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {Audio} from '@remotion/media';
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import type {ReactNode} from 'react';

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const SHORT_VIDEO_WIDTH = 1080;
export const SHORT_VIDEO_HEIGHT = 1920;
export const PROMO_FPS = 30;
export const SHORT_DURATION_FRAMES = PROMO_FPS * 15;

const TRANSITION_FRAMES = 24;
const SCENE_DURATIONS = [180, 180, 210, 190, 200, 220, 210];
const SCENE_START_FRAMES = SCENE_DURATIONS.map((_, index) =>
  SCENE_DURATIONS.slice(0, index).reduce((sum, duration) => sum + duration, 0) -
  TRANSITION_FRAMES * index,
);

export const PROMO_DURATION_FRAMES =
  SCENE_DURATIONS.reduce((sum, duration) => sum + duration, 0) -
  TRANSITION_FRAMES * (SCENE_DURATIONS.length - 1);

const fontFamily =
  'Inter, "SF Pro Display", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
const monoFamily =
  '"SFMono-Regular", "Cascadia Code", "JetBrains Mono", Menlo, Consolas, monospace';

const colors = {
  ink: '#081017',
  panel: 'rgba(8, 15, 22, 0.78)',
  panelSolid: '#111a22',
  line: 'rgba(226, 241, 255, 0.16)',
  text: '#eff8ff',
  muted: '#93a7b4',
  cyan: '#27d9f2',
  green: '#64e582',
  amber: '#ffbf5a',
  red: '#ff6b6b',
  white: '#ffffff',
};

const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeInOut = Easing.bezier(0.45, 0, 0.55, 1);

const enter = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

const softPulse = (frame: number, phase = 0) =>
  0.65 + Math.sin((frame + phase) / 18) * 0.35;

const AudioMix = ({short = false}: {short?: boolean}) => {
  const duration = short ? SHORT_DURATION_FRAMES : PROMO_DURATION_FRAMES;
  const whooshFrames = short ? [0, 114, 252] : SCENE_START_FRAMES.slice(1);
  const dingFrames = short ? [78, 218, 346] : [96, 414, 610, 914, 1104];

  return (
    <>
      <Audio
        src={staticFile('assets/audio/promo-bed.wav')}
        volume={(frame) =>
          interpolate(frame, [0, 42, Math.max(42, duration - 70), duration], [0, 0.17, 0.17, 0], clamp)
        }
      />
      {whooshFrames.map((from) => (
        <Sequence key={`whoosh-${from}`} from={from}>
          <Audio src={staticFile('assets/audio/soft-whoosh.wav')} volume={short ? 0.42 : 0.32} />
        </Sequence>
      ))}
      {dingFrames.map((from) => (
        <Sequence key={`ding-${from}`} from={from}>
          <Audio src={staticFile('assets/audio/soft-ding.wav')} volume={short ? 0.5 : 0.38} />
        </Sequence>
      ))}
    </>
  );
};

type SceneChromeProps = {
  children: ReactNode;
  kicker: string;
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
};

const SceneChrome = ({children, kicker, title, subtitle, align = 'left'}: SceneChromeProps) => {
  const frame = useCurrentFrame();
  const a = enter(frame, 4, 28);

  return (
    <AbsoluteFill style={{backgroundColor: colors.ink, color: colors.text, fontFamily}}>
      <AmbientBackground />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: align === 'center' ? '96px 120px' : '84px 104px',
        }}
      >
        <div
          style={{
            width: align === 'center' ? '100%' : 800,
            textAlign: align,
            opacity: a,
            transform: `translateY(${interpolate(a, [0, 1], [28, 0])}px)`,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 14px',
              border: `1px solid ${colors.line}`,
              borderRadius: 999,
              background: 'rgba(10, 20, 28, 0.58)',
              color: colors.cyan,
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 9,
                background: colors.green,
                boxShadow: `0 0 24px ${colors.green}`,
              }}
            />
            {kicker}
          </div>
          <h1
            style={{
              margin: '28px 0 0',
              fontSize: align === 'center' ? 96 : 82,
              lineHeight: 1.02,
              fontWeight: 860,
              letterSpacing: 0,
              maxWidth: align === 'center' ? 1300 : 880,
              whiteSpace: 'pre-line',
            }}
          >
            {title}
          </h1>
          {subtitle ? (
            <p
              style={{
                margin: '24px 0 0',
                color: '#c7d7e2',
                fontSize: 32,
                lineHeight: 1.42,
                maxWidth: align === 'center' ? 1180 : 760,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>
    </AbsoluteFill>
  );
};

const AmbientBackground = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 240], [0, 36], {
    ...clamp,
    easing: easeInOut,
  });

  return (
    <AbsoluteFill
      style={{
        background:
          'linear-gradient(128deg, #061016 0%, #0a1820 42%, #142019 70%, #21190f 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.34,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          transform: `translate3d(${-drift}px, ${drift / 2}px, 0)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(90deg, rgba(8,16,23,0.92) 0%, rgba(8,16,23,0.35) 45%, rgba(8,16,23,0.76) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};

const KeyVisual = () => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 180], [1.08, 1.02], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <Img
      src={staticFile('assets/localization-key-visual.png')}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: `scale(${scale})`,
        opacity: 0.76,
      }}
    />
  );
};

type TerminalLine = {
  text: string;
  tone?: 'muted' | 'green' | 'amber' | 'red' | 'cyan';
};

const Terminal = ({
  lines,
  width = 740,
  height = 410,
  label = 'Terminal',
}: {
  lines: TerminalLine[];
  width?: number;
  height?: number;
  label?: string;
}) => {
  const frame = useCurrentFrame();
  const progress = enter(frame, 8, 32);

  return (
    <div
      style={{
        width,
        height,
        borderRadius: 18,
        border: `1px solid ${colors.line}`,
        background: 'rgba(6, 12, 18, 0.88)',
        boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
        overflow: 'hidden',
        transform: `translateY(${interpolate(progress, [0, 1], [34, 0])}px)`,
        opacity: progress,
      }}
    >
      <div
        style={{
          height: 54,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 22px',
          borderBottom: `1px solid ${colors.line}`,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {['#ff5f57', '#ffbd2e', '#28c840'].map((color) => (
          <span key={color} style={{width: 14, height: 14, borderRadius: 14, background: color}} />
        ))}
        <span style={{marginLeft: 16, color: colors.muted, fontFamily: monoFamily, fontSize: 18}}>
          {label}
        </span>
      </div>
      <div style={{padding: '24px 26px', fontFamily: monoFamily, fontSize: 24, lineHeight: 1.62}}>
        {lines.map((line, index) => {
          const lineIn = enter(frame, 18 + index * 10, 18);
          const color =
            line.tone === 'green'
              ? colors.green
              : line.tone === 'amber'
                ? colors.amber
                : line.tone === 'red'
                  ? colors.red
                  : line.tone === 'cyan'
                    ? colors.cyan
                    : line.tone === 'muted'
                      ? colors.muted
                      : colors.text;

          return (
            <div
              key={line.text}
              style={{
                opacity: lineIn,
                color,
                whiteSpace: 'pre-wrap',
                transform: `translateX(${interpolate(lineIn, [0, 1], [20, 0])}px)`,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MetricCard = ({value, label, accent, delay}: {value: string; label: string; accent: string; delay: number}) => {
  const frame = useCurrentFrame();
  const a = enter(frame, delay, 24);
  const pop = spring({
    frame: Math.max(0, frame - delay),
    fps: PROMO_FPS,
    config: {damping: 18, stiffness: 120},
  });

  return (
    <div
      style={{
        width: 310,
        height: 184,
        borderRadius: 16,
        padding: 26,
        border: `1px solid ${colors.line}`,
        background: colors.panel,
        opacity: a,
        transform: `translateY(${interpolate(a, [0, 1], [28, 0])}px) scale(${0.96 + pop * 0.04})`,
      }}
    >
      <div style={{fontSize: 62, fontWeight: 860, lineHeight: 1, color: accent}}>{value}</div>
      <div style={{marginTop: 18, fontSize: 25, lineHeight: 1.28, color: '#d9e8f1'}}>{label}</div>
    </div>
  );
};

const Arrow = ({delay}: {delay: number}) => {
  const frame = useCurrentFrame();
  const a = enter(frame, delay, 22);
  const x = interpolate(softPulse(frame), [0, 1], [-4, 14]);

  return (
    <div
      style={{
        width: 126,
        opacity: a,
        color: colors.cyan,
        fontSize: 56,
        fontWeight: 800,
        transform: `translateX(${x}px)`,
        textAlign: 'center',
      }}
    >
      →
    </div>
  );
};

const BeforeAfterScene = () => {
  return (
      <SceneChrome
        kicker="Before / After"
      title={'终端体验\n切回中文语境'}
      subtitle="不是只翻一句提示，而是把日常交互里的状态、提示、Hook 和输出风格一起接上。"
    >
      <div style={{position: 'absolute', left: 104, right: 104, bottom: 92, display: 'flex', alignItems: 'center'}}>
        <Terminal
          label="before"
          lines={[
            {text: '$ claude', tone: 'muted'},
            {text: '⠙ Photosynthesizing...', tone: 'amber'},
            {text: 'Tip: Press Shift+Tab to switch modes'},
            {text: 'Done in 1m23s', tone: 'muted'},
          ]}
          width={690}
          height={370}
        />
        <Arrow delay={54} />
        <Terminal
          label="after"
          lines={[
            {text: '$ claude', tone: 'muted'},
            {text: '⠙ 光合作用中...', tone: 'green'},
            {text: '💡 按 Shift+Tab 切换工作模式'},
            {text: '琢磨了 1分23秒', tone: 'cyan'},
          ]}
          width={690}
          height={370}
        />
      </div>
    </SceneChrome>
  );
};

const IntroScene = () => {
  const frame = useCurrentFrame();
  const glow = interpolate(softPulse(frame), [0, 1], [0.35, 0.8]);

  return (
    <AbsoluteFill style={{backgroundColor: colors.ink, color: colors.text, fontFamily}}>
      <KeyVisual />
      <div style={{position: 'absolute', inset: 0, background: 'rgba(4, 9, 14, 0.42)'}} />
      <div style={{position: 'absolute', left: 104, top: 98, width: 980}}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '10px 16px',
            borderRadius: 999,
            color: colors.green,
            background: 'rgba(8, 20, 22, 0.68)',
            border: `1px solid rgba(100, 229, 130, ${0.28 + glow * 0.18})`,
            fontSize: 25,
            fontWeight: 760,
          }}
        >
          <span style={{fontFamily: monoFamily}}>claude-code-zh-cn</span>
          <span style={{color: colors.muted}}>中文本地化插件</span>
        </div>
        <h1
          style={{
            margin: '42px 0 0',
            fontSize: 106,
            lineHeight: 1,
            fontWeight: 900,
            letterSpacing: 0,
            maxWidth: 940,
            whiteSpace: 'pre-line',
          }}
        >
          {'Claude Code\n终于能自然说中文'}
        </h1>
        <p style={{margin: '30px 0 0', fontSize: 34, lineHeight: 1.42, color: '#d1e1ea', maxWidth: 820}}>
          装完立刻看到中文 spinner、提示和输出风格；更新后自动修复，卸载不丢配置。
        </p>
      </div>
      <div style={{position: 'absolute', left: 104, bottom: 96}}>
        <Terminal
          label="install"
          width={760}
          height={300}
          lines={[
            {text: 'git clone https://github.com/taekchef/claude-code-zh-cn.git', tone: 'muted'},
            {text: 'cd claude-code-zh-cn', tone: 'muted'},
            {text: './install.sh', tone: 'green'},
            {text: '✓ 中文插件已安装', tone: 'cyan'},
          ]}
        />
      </div>
    </AbsoluteFill>
  );
};

const InstallScene = () => {
  const frame = useCurrentFrame();
  const progress = enter(frame, 34, 82);

  return (
      <SceneChrome
      kicker="Install"
      title={'安装脚本\n替你处理脏活'}
      subtitle="自动备份、合并 settings、安装插件、按当前 Claude Code 形态决定是否安全 patch。"
    >
      <div style={{position: 'absolute', right: 104, bottom: 100, width: 740}}>
        <div
          style={{
            height: 390,
            borderRadius: 18,
            border: `1px solid ${colors.line}`,
            background: colors.panel,
            padding: 36,
            boxShadow: '0 32px 90px rgba(0,0,0,0.36)',
          }}
        >
          {[
            ['备份原配置', colors.cyan],
            ['合并中文设置', colors.green],
            ['同步插件 payload', colors.amber],
            ['支持范围内自动 patch', colors.green],
          ].map(([label, color], index) => {
            const a = enter(frame, 18 + index * 22, 20);
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  height: 78,
                  opacity: a,
                  transform: `translateX(${interpolate(a, [0, 1], [32, 0])}px)`,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 38,
                    display: 'grid',
                    placeItems: 'center',
                    background: color,
                    color: '#061016',
                    fontSize: 27,
                    fontWeight: 900,
                  }}
                >
                  ✓
                </div>
                <div style={{fontSize: 32, fontWeight: 740}}>{label}</div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 28,
              height: 12,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${interpolate(progress, [0, 1], [0, 100])}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${colors.cyan}, ${colors.green}, ${colors.amber})`,
              }}
            />
          </div>
        </div>
      </div>
    </SceneChrome>
  );
};

const CoverageScene = () => {
  return (
      <SceneChrome
      kicker="Coverage"
      title={'不是一句中文\n是一整套中文体验'}
      subtitle="常见 UI 文案、spinner 动词、提示语和回复语言都放进同一条安装链路里。"
    >
      <div
        style={{
          position: 'absolute',
          left: 104,
          right: 104,
          bottom: 112,
          display: 'flex',
          gap: 28,
          justifyContent: 'space-between',
        }}
      >
        <MetricCard value="1653" label="UI 翻译对照" accent={colors.cyan} delay={22} />
        <MetricCard value="187" label="趣味 spinner 动词" accent={colors.green} delay={42} />
        <MetricCard value="41" label="中文提示语" accent={colors.amber} delay={62} />
        <MetricCard value="4 层" label="设置 + Hook + 插件 + CLI Patch" accent={colors.white} delay={82} />
      </div>
      <div style={{position: 'absolute', right: 104, top: 260}}>
        <Terminal
          label="spinner-preview"
          width={680}
          height={260}
          lines={[
            {text: '⠙ 蹦迪中...', tone: 'green'},
            {text: '⠙ 七荤八素中...', tone: 'cyan'},
            {text: '⠙ 搞事情中...', tone: 'amber'},
            {text: 'AI 默认中文回复', tone: 'muted'},
          ]}
        />
      </div>
    </SceneChrome>
  );
};

const TrustScene = () => {
  const frame = useCurrentFrame();
  const rows = [
    ['npm global install', '2.1.92 - 2.1.112', 'stable', colors.green],
    ['macOS native binary', '2.1.113 - 2.1.123', 'experimental', colors.amber],
    ['Windows npm PowerShell', '2.1.92 - 2.1.112', 'stable', colors.green],
    ['latest / unsupported', '安全跳过 CLI Patch', 'skipped', colors.red],
  ] as const;

  return (
      <SceneChrome
      kicker="Trust"
      title={'支持边界讲清楚\n才是真稳定'}
      subtitle="能完整中文化就启用；没验证的版本明确跳过，不把风险伪装成成功。"
    >
      <div style={{position: 'absolute', left: 104, right: 104, bottom: 98}}>
        <div
          style={{
            borderRadius: 18,
            border: `1px solid ${colors.line}`,
            background: colors.panel,
            overflow: 'hidden',
            boxShadow: '0 32px 90px rgba(0,0,0,0.34)',
          }}
        >
          {rows.map(([channel, range, status, color], index) => {
            const a = enter(frame, 24 + index * 16, 20);
            return (
              <div
                key={channel}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr 260px',
                  alignItems: 'center',
                  minHeight: 86,
                  padding: '0 34px',
                  borderTop: index === 0 ? 'none' : `1px solid ${colors.line}`,
                  opacity: a,
                  transform: `translateY(${interpolate(a, [0, 1], [24, 0])}px)`,
                }}
              >
                <div style={{fontSize: 28, fontWeight: 760}}>{channel}</div>
                <div style={{fontFamily: monoFamily, fontSize: 24, color: colors.muted}}>{range}</div>
                <div
                  style={{
                    justifySelf: 'end',
                    padding: '9px 16px',
                    borderRadius: 999,
                    color,
                    border: `1px solid ${color}`,
                    background: 'rgba(255,255,255,0.04)',
                    fontSize: 22,
                    fontWeight: 760,
                  }}
                >
                  {status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneChrome>
  );
};

const AutoRepairScene = () => {
  const frame = useCurrentFrame();
  const ring = interpolate(frame, [12, 118], [0, 1], {
    ...clamp,
    easing: easeInOut,
  });

  return (
      <SceneChrome
      kicker="Auto Repair"
      title={'Claude Code 更新后\n也会自动重新接上'}
      subtitle="启动前 launcher + session-start Hook 二层兜底，让更新后的英文回退尽量短。"
    >
      <div style={{position: 'absolute', right: 130, top: 240, width: 620, height: 620}}>
        <div
          style={{
            position: 'absolute',
            inset: 56,
            borderRadius: 520,
            border: `3px solid rgba(39,217,242,${0.28 + ring * 0.34})`,
            transform: `rotate(${ring * 280}deg)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 120,
            borderRadius: 420,
            border: `3px solid rgba(100,229,130,${0.24 + ring * 0.38})`,
            transform: `rotate(${-ring * 220}deg)`,
          }}
        />
        {([
          ['检测版本变化', 240, 18, colors.cyan],
          ['计算 patch 指纹', 32, 300, colors.amber],
          ['重新应用中文化', 268, 460, colors.green],
          ['保留用户配置', 436, 192, colors.white],
        ] as const).map(([label, left, top, color], index) => {
          const a = enter(frame, 28 + index * 18, 22);
          return (
            <div
              key={label}
              style={{
                position: 'absolute',
                left,
                top,
                width: 190,
                padding: '14px 16px',
                borderRadius: 14,
                border: `1px solid ${colors.line}`,
                background: 'rgba(8,15,22,0.82)',
                color,
                fontSize: 23,
                fontWeight: 760,
                opacity: a,
                transform: `scale(${0.92 + a * 0.08})`,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 104, bottom: 98}}>
        <Terminal
          label="session-start"
          width={720}
          height={290}
          lines={[
            {text: 'Claude Code version changed', tone: 'muted'},
            {text: 'patch revision: verified', tone: 'cyan'},
            {text: '中文化自动修复完成', tone: 'green'},
            {text: 'settings.json 已保留用户配置', tone: 'amber'},
          ]}
        />
      </div>
    </SceneChrome>
  );
};

const OutroScene = () => {
  const frame = useCurrentFrame();
  const a = enter(frame, 16, 34);
  const text = 'github.com/taekchef/claude-code-zh-cn';
  const typed = text.slice(0, Math.floor(interpolate(frame, [54, 116], [0, text.length], clamp)));
  const commandIn = enter(frame, 92, 26);

  return (
    <AbsoluteFill style={{backgroundColor: colors.ink, color: colors.text, fontFamily}}>
      <KeyVisual />
      <div style={{position: 'absolute', inset: 0, background: 'rgba(5, 10, 14, 0.58)'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 160px',
          opacity: a,
          transform: `translateY(${interpolate(a, [0, 1], [26, 0])}px)`,
        }}
      >
        <div style={{fontFamily: monoFamily, color: colors.green, fontSize: 34, fontWeight: 760}}>
          claude-code-zh-cn
        </div>
        <h2
          style={{
            margin: '28px 0 0',
            fontSize: 96,
            lineHeight: 1.05,
            fontWeight: 900,
            letterSpacing: 0,
            whiteSpace: 'pre-line',
          }}
        >
          {'让中文开发者\n少一点摩擦，多一点顺手'}
        </h2>
        <div
          style={{
            marginTop: 42,
            minWidth: 860,
            height: 74,
            borderRadius: 14,
            border: `1px solid ${colors.line}`,
            background: 'rgba(8,15,22,0.76)',
            display: 'grid',
            placeItems: 'center',
            fontFamily: monoFamily,
            fontSize: 27,
            color: colors.cyan,
          }}
        >
          {typed}
          <span style={{opacity: softPulse(frame) > 0.64 ? 1 : 0}}>_</span>
        </div>
        <div
          style={{
            marginTop: 22,
            minWidth: 900,
            padding: '18px 28px',
            borderRadius: 16,
            border: `1px solid rgba(100,229,130,0.34)`,
            background: 'rgba(7, 18, 16, 0.78)',
            color: colors.green,
            fontFamily: monoFamily,
            fontSize: 25,
            opacity: commandIn,
            transform: `translateY(${interpolate(commandIn, [0, 1], [18, 0])}px)`,
          }}
        >
          git clone ... && cd claude-code-zh-cn && ./install.sh
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const PromoVideo = () => {
  const timing = linearTiming({durationInFrames: TRANSITION_FRAMES});

  return (
    <>
      <AudioMix />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[0]}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[1]}>
          <BeforeAfterScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: 'from-right'})} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[2]}>
          <InstallScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[3]}>
          <CoverageScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: 'from-bottom'})} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[4]}>
          <TrustScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[5]}>
          <AutoRepairScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS[6]}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </>
  );
};

const verticalSceneOpacity = (frame: number, start: number, end: number, fade = 18) => {
  const inProgress = enter(frame, start, fade);
  const outProgress = interpolate(frame, [end - fade, end], [0, 1], clamp);

  return inProgress * (1 - outProgress);
};

const VerticalTerminal = ({frame}: {frame: number}) => {
  const lines = [
    {text: '$ claude', tone: colors.muted, delay: 0},
    {text: '⠙ 光合作用中...', tone: colors.green, delay: 10},
    {text: '💡 按 Shift+Tab 切换工作模式', tone: colors.cyan, delay: 20},
    {text: '中文化自动修复完成', tone: colors.amber, delay: 30},
  ];

  return (
    <div
      style={{
        width: 860,
        borderRadius: 24,
        border: `1px solid ${colors.line}`,
        background: 'rgba(5, 12, 18, 0.86)',
        overflow: 'hidden',
        boxShadow: '0 38px 100px rgba(0,0,0,0.42)',
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 26px',
          borderBottom: `1px solid ${colors.line}`,
          background: 'rgba(255,255,255,0.04)',
        }}
      >
        {['#ff5f57', '#ffbd2e', '#28c840'].map((color) => (
          <span key={color} style={{width: 16, height: 16, borderRadius: 16, background: color}} />
        ))}
        <span style={{marginLeft: 16, color: colors.muted, fontFamily: monoFamily, fontSize: 23}}>
          install preview
        </span>
      </div>
      <div style={{padding: '32px 34px', fontFamily: monoFamily, fontSize: 34, lineHeight: 1.62}}>
        {lines.map((line) => {
          const a = enter(frame, 116 + line.delay, 16);

          return (
            <div
              key={line.text}
              style={{
                color: line.tone,
                opacity: a,
                transform: `translateX(${interpolate(a, [0, 1], [24, 0])}px)`,
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const VerticalMetric = ({value, label, color, delay}: {value: string; label: string; color: string; delay: number}) => {
  const frame = useCurrentFrame();
  const a = enter(frame, delay, 18);

  return (
    <div
      style={{
        width: 250,
        height: 172,
        borderRadius: 22,
        padding: 24,
        border: `1px solid ${colors.line}`,
        background: 'rgba(7, 16, 22, 0.78)',
        opacity: a,
        transform: `translateY(${interpolate(a, [0, 1], [24, 0])}px)`,
      }}
    >
      <div style={{fontSize: 54, lineHeight: 1, fontWeight: 900, color}}>{value}</div>
      <div style={{marginTop: 16, fontSize: 22, lineHeight: 1.25, color: '#d7e8f0'}}>{label}</div>
    </div>
  );
};

export const PromoShortVertical = () => {
  const frame = useCurrentFrame();
  const hookOpacity = verticalSceneOpacity(frame, 0, 168, 20);
  const proofOpacity = verticalSceneOpacity(frame, 118, 318, 20);
  const ctaOpacity = enter(frame, 296, 28);

  return (
    <AbsoluteFill style={{backgroundColor: colors.ink, color: colors.text, fontFamily}}>
      <AudioMix short />
      <KeyVisual />
      <div style={{position: 'absolute', inset: 0, background: 'rgba(3, 8, 12, 0.62)'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(8,16,23,0.94) 0%, rgba(8,16,23,0.34) 46%, rgba(8,16,23,0.92) 100%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 104,
          left: 70,
          right: 70,
          opacity: hookOpacity,
          transform: `translateY(${interpolate(hookOpacity, [0, 1], [34, 0])}px)`,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 18px',
            borderRadius: 999,
            background: 'rgba(8, 20, 22, 0.7)',
            border: `1px solid rgba(100,229,130,0.32)`,
            color: colors.green,
            fontFamily: monoFamily,
            fontSize: 28,
            fontWeight: 780,
          }}
        >
          claude-code-zh-cn
        </div>
        <h1
          style={{
            margin: '42px 0 0',
            fontSize: 96,
            lineHeight: 1.03,
            letterSpacing: 0,
            fontWeight: 900,
            whiteSpace: 'pre-line',
          }}
        >
          {'Claude Code\n终于能自然\n说中文'}
        </h1>
        <p style={{marginTop: 34, fontSize: 38, lineHeight: 1.36, color: '#d6e8f2'}}>
          装完立刻看到中文 spinner、提示和输出风格。
        </p>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 620,
          left: 70,
          right: 70,
          opacity: proofOpacity,
          transform: `translateY(${interpolate(proofOpacity, [0, 1], [42, 0])}px)`,
        }}
      >
        <VerticalTerminal frame={frame} />
        <div style={{display: 'flex', gap: 22, marginTop: 34}}>
          <VerticalMetric value="1653" label="UI 翻译" color={colors.cyan} delay={178} />
          <VerticalMetric value="187" label="动词中文化" color={colors.green} delay={194} />
          <VerticalMetric value="41" label="中文提示" color={colors.amber} delay={210} />
        </div>
        <div
          style={{
            marginTop: 30,
            padding: '20px 26px',
            borderRadius: 20,
            border: `1px solid rgba(255,191,90,0.32)`,
            background: 'rgba(15, 13, 8, 0.7)',
            color: colors.amber,
            fontSize: 29,
            fontWeight: 760,
          }}
        >
          支持边界清楚：能 patch 就启用，未验证版本安全跳过。
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          bottom: 106,
          opacity: ctaOpacity,
          transform: `translateY(${interpolate(ctaOpacity, [0, 1], [38, 0])}px)`,
        }}
      >
        <h2 style={{margin: 0, fontSize: 64, lineHeight: 1.08, fontWeight: 900, letterSpacing: 0}}>
          少一点摩擦，多一点顺手
        </h2>
        <div
          style={{
            marginTop: 28,
            padding: '20px 24px',
            borderRadius: 18,
            border: `1px solid ${colors.line}`,
            background: 'rgba(6, 13, 18, 0.82)',
            color: colors.cyan,
            fontFamily: monoFamily,
            fontSize: 27,
            lineHeight: 1.35,
          }}
        >
          github.com/taekchef/claude-code-zh-cn
        </div>
        <div
          style={{
            marginTop: 16,
            padding: '18px 24px',
            borderRadius: 18,
            background: 'rgba(7, 20, 16, 0.82)',
            border: `1px solid rgba(100,229,130,0.34)`,
            color: colors.green,
            fontFamily: monoFamily,
            fontSize: 28,
            lineHeight: 1.35,
          }}
        >
          git clone ... && ./install.sh
        </div>
      </div>
    </AbsoluteFill>
  );
};
