import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Prontofolio's dark palette, copied from apps/web/src/styles/globals.css (.dark)
// as hex because a video has no theme switch.
export const C = {
  bg: "#0b132b", // Azul Noche
  card: "#141f39",
  cardHi: "#1b2848",
  border: "#24304c",
  fg: "#ecf2fa", // Blanco Hielo
  muted: "#9aa6b9",
  faint: "#56637c",
  blue: "#2563ff", // Azul Eléctrico
  blueHi: "#3d73ff",
  cyan: "#00c2ff", // Cian Digital
  green: "#17c964", // Verde Data
  red: "#ef5a5a",
  amber: "#f5b544",
};

export const DISPLAY = "Space Grotesk";
export const BODY = "Manrope";

loadFont({ family: DISPLAY, url: staticFile("fonts/space-grotesk-latin-wght-normal.woff2"), weight: "300 700" });
loadFont({ family: BODY, url: staticFile("fonts/manrope-latin-wght-normal.woff2"), weight: "200 800" });

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
