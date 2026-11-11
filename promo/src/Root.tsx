import React from "react";
import { Composition } from "remotion";
import { Promo, TOTAL_FRAMES, type PromoProps } from "./Promo";
import { FPS, HEIGHT, WIDTH } from "./theme";

const defaults: PromoProps = { captions: true, cta: "Empezá hoy" };

export const Root: React.FC = () => (
  <Composition
    id="Promo"
    component={Promo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={defaults}
  />
);
