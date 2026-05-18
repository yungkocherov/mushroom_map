/**
 * Geobiom logo — H1 Hybrid Classic, RN port.
 *
 * Mirrors apps/web/src/components/Logo.tsx — same SVG geometry,
 * Reanimated breathe animation in place of CSS keyframes.
 *
 * Source: docs/redesign-2026-05/claude-design/src/d1v2-hybrids.jsx:39-48
 */

import { useEffect } from "react";
import Svg, { G, Path, Rect } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  cancelAnimation,
} from "react-native-reanimated";
import { palette } from "@mushroom-map/tokens/native";

type LogoProps = {
  size?: number;
  /** Stroke/fill color of pine + boletus stem + contour. Defaults to palette.light.forest. */
  color?: string;
  /** Cap of the boletus. Defaults to palette.light.chanterelle. */
  accent?: string;
  breathe?: boolean;
};

const AnimatedG = Animated.createAnimatedComponent(G);

export function Logo({
  size = 56,
  color = palette.light.forest,
  accent = palette.light.chanterelle,
  breathe = true,
}: LogoProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!breathe) return;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.045, { duration: 2500 }),
        withTiming(1, { duration: 2500 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(scale);
  }, [breathe, scale]);

  const animatedProps = useAnimatedProps(() => ({
    scale: scale.value,
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <AnimatedG animatedProps={animatedProps} originX={32} originY={50}>
        {/* Pine — trunk + 3-tier triangle */}
        <Rect x={22} y={46} width={4} height={6} fill={color} />
        <Path
          d="M24 8 L 12 30 L 18 30 L 8 46 L 40 46 L 30 30 L 36 30 Z"
          fill={color}
        />

        {/* Boletus — stem + cap + contour echo */}
        <G x={46} y={44}>
          <Path
            d="M-3 0 C -3 5, -4 7, -2.5 8 L 3 8 C 4.5 7, 3.5 5, 3 0 Z"
            fill={color}
          />
          <Path
            d="M-7 -1 C -7 -7, -3 -10, 0 -10 C 3 -10, 7 -7, 7 -1 C 7 1, 4 1.5, 0 1.5 C -4 1.5, -7 1, -7 -1 Z"
            fill={accent}
          />
          <Path
            d="M-5 -3 Q 0 -7, 5 -3"
            fill="none"
            stroke="rgba(0,0,0,0.2)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        </G>

        {/* Topographic ground contours */}
        <Path
          d="M3.2 55 Q 32 51, 60.8 55"
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.5}
        />
        <Path
          d="M11.5 59 Q 32 55, 52.5 59"
          fill="none"
          stroke={color}
          strokeWidth={1.1}
          strokeLinecap="round"
          opacity={0.275}
        />
        <Path
          d="M14 60 Q 32 56, 50 60"
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.25}
        />
      </AnimatedG>
    </Svg>
  );
}
