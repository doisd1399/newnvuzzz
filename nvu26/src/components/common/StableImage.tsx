import React, { useEffect, useState } from "react";
import { isImageReady, preloadImage } from "../../lib/imageCache";
import { cn } from "../../lib/utils";

interface StableImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  wrapperClassName: string;
  fallback: React.ReactNode;
  preload?: boolean;
}

/**
 * Keeps a deterministic fallback underneath the native image. The image is
 * never visibility-gated by JavaScript, so a stalled decode() cannot make a
 * valid photo disappear in mobile Preview/WebView environments.
 */
export function StableImage({
  src,
  wrapperClassName,
  fallback,
  preload = true,
  className,
  alt = "",
  onLoad,
  onError,
  ...imageProps
}: StableImageProps) {
  const normalizedSrc = src?.trim() || "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === normalizedSrc;

  useEffect(() => {
    let active = true;

    if (preload && normalizedSrc && !isImageReady(normalizedSrc)) {
      void preloadImage(normalizedSrc).then(() => {
        if (active && isImageReady(normalizedSrc)) {
          setFailedSrc((current) =>
            current === normalizedSrc ? null : current,
          );
        }
      });
    }

    return () => {
      active = false;
    };
  }, [normalizedSrc, preload]);

  return (
    <span
      className={cn(
        "relative inline-flex overflow-hidden align-middle",
        wrapperClassName,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center"
      >
        {fallback}
      </span>

      {normalizedSrc && !failed && (
        <img
          {...imageProps}
          src={normalizedSrc}
          alt={alt}
          className={cn("absolute inset-0 h-full w-full", className)}
          onLoad={(event) => {
            setFailedSrc(null);
            // Warm the shared cache, but never wait for it to show this native
            // image. onLoad already proves that the browser can render it.
            void preloadImage(normalizedSrc);
            onLoad?.(event);
          }}
          onError={(event) => {
            setFailedSrc(normalizedSrc);
            onError?.(event);
          }}
        />
      )}
    </span>
  );
}
