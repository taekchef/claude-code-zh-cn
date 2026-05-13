import {Composition, Folder} from 'remotion';
import {
  PromoShortVertical,
  PromoVideo,
  PROMO_DURATION_FRAMES,
  PROMO_FPS,
  SHORT_DURATION_FRAMES,
  SHORT_VIDEO_HEIGHT,
  SHORT_VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from './PromoVideo';

export const RemotionRoot = () => {
  return (
    <Folder name="claude-code-zh-cn">
      <Composition
        id="PromoVideo"
        component={PromoVideo}
        durationInFrames={PROMO_DURATION_FRAMES}
        fps={PROMO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
      />
      <Composition
        id="PromoShortVertical"
        component={PromoShortVertical}
        durationInFrames={SHORT_DURATION_FRAMES}
        fps={PROMO_FPS}
        width={SHORT_VIDEO_WIDTH}
        height={SHORT_VIDEO_HEIGHT}
      />
    </Folder>
  );
};
