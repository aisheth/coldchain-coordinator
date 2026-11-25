import { useEffect, useState } from "react";
import { downloadAttachment } from "@/lib/api";

export function AttachmentImage({
  id,
  alt = "Proof",
  className = "aspect-square rounded-md border object-cover",
}: {
  id: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl(null);
    setError(false);
    downloadAttachment(id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);
  if (error)
    return (
      <div
        className={`${className} flex items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground`}
      >
        Photo could not be loaded
      </div>
    );
  if (!url)
    return <div className={`${className} animate-pulse bg-muted`} aria-label="Loading photo" />;
  return <img src={url} alt={alt} className={className} />;
}
