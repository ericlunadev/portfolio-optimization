/**
 * Rasterizes a live SVG node (e.g. a Recharts surface) into a PNG data URL.
 *
 * The DOM tree is styled by external stylesheets, but a serialized SVG carries
 * none of them. So the clone gets every relevant computed property written back
 * as an inline `style` before serialization, otherwise axis labels and grid
 * lines come out black-on-black — or vanish entirely.
 */

/** Properties that affect how an SVG node paints. Copied onto the clone. */
const PAINT_PROPERTIES = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "stop-color",
  "stop-opacity",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
  "paint-order",
  "shape-rendering",
] as const;

/**
 * Web fonts are not embedded in the serialized SVG, so the rasterizer would
 * silently fall back to an unpredictable default. Pin a stack that is always
 * present instead.
 */
const RASTER_FONT_STACK = "Helvetica, Arial, sans-serif";

export interface RasterizedSvg {
  dataUrl: string;
  /** CSS pixel size of the source node (not the scaled bitmap). */
  width: number;
  height: number;
}

export interface SvgToPngOptions {
  /** Device-pixel multiplier for the output bitmap. Defaults to 2. */
  scale?: number;
  /** Painted behind the SVG. Required for dark charts, which have no own background. */
  background?: string;
}

export async function svgToPng(
  source: SVGSVGElement,
  options: SvgToPngOptions = {}
): Promise<RasterizedSvg> {
  const { scale = 2, background } = options;

  const rect = source.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || source.clientWidth));
  const height = Math.max(1, Math.round(rect.height || source.clientHeight));

  const clone = source.cloneNode(true) as SVGSVGElement;
  inlinePaintStyles(source, clone);

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(
    new Blob([markup], { type: "image/svg+xml;charset=utf-8" })
  );

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not acquire a 2D canvas context");

    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Walks source and clone in lockstep, freezing computed paint styles onto the clone. */
function inlinePaintStyles(source: Element, clone: Element): void {
  const computed = window.getComputedStyle(source);

  let css = "";
  for (const property of PAINT_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) css += `${property}:${value};`;
  }
  css += `font-family:${RASTER_FONT_STACK};`;
  clone.setAttribute("style", css);

  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  for (let i = 0; i < sourceChildren.length; i++) {
    const cloneChild = cloneChildren[i];
    if (cloneChild) inlinePaintStyles(sourceChildren[i], cloneChild);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to rasterize SVG markup"));
    image.src = url;
  });
}
