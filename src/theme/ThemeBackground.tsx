import { CANVAS_BG, useTheme } from './themeMode';

/** R3F scene background that follows the app theme (pastel or studio). Use inside a <Canvas>. */
export function ThemeBackground() {
  const theme = useTheme();
  return <color attach="background" args={[CANVAS_BG[theme]]} />;
}
