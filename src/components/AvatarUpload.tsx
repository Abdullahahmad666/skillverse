import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { Avatar } from "./Avatar";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Avatar picker: upload an image file OR take a live selfie with the camera.
 * Uploads to the public "avatars" bucket (migration 0010) under the user's own
 * folder, then hands the resulting public URL back via onChange. The parent
 * persists it with the rest of the profile form.
 */
export function AvatarUpload({
  userId,
  name,
  url,
  onChange,
}: {
  userId: string;
  name: string;
  url: string | null;
  onChange: (publicUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);

  const uploadBlob = async (blob: Blob, ext: string) => {
    setError(null);
    if (blob.size > MAX_BYTES) {
      setError("Image must be under 5 MB.");
      return;
    }
    setBusy(true);
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
    if (upErr) {
      setBusy(false);
      setError("Upload failed. Please try again.");
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setBusy(false);
    onChange(data.publicUrl);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    await uploadBlob(file, ext);
  };

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar size="lg" name={name} url={url} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="btn-ghost !px-3.5 !py-2 text-sm"
          >
            <UploadIcon /> Upload photo
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSelfieOpen(true);
            }}
            disabled={busy}
            className="btn-ghost !px-3.5 !py-2 text-sm"
          >
            <CameraIcon /> Take selfie
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
      </div>
      {busy && <p className="mt-2 text-xs text-fog">Uploading…</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {selfieOpen && (
        <SelfieModal
          onCapture={async (blob) => {
            setSelfieOpen(false);
            await uploadBlob(blob, "jpg");
          }}
          onClose={() => setSelfieOpen(false)}
        />
      )}
    </div>
  );
}

function SelfieModal({
  onCapture,
  onClose,
}: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This device or browser can't access the camera.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      })
      .catch(() => setError("Couldn't access the camera. Check the site's camera permission."));

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    // Center-crop to a square and mirror (to match the preview).
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.9);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Take a selfie"
    >
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm" />
      <div className="reveal relative w-full max-w-sm rounded-2xl border border-mist bg-card p-5 shadow-lift">
        <h2 className="font-display text-lg font-bold">Take a selfie</h2>
        {error ? (
          <p className="mt-3 text-sm text-danger">{error}</p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl bg-abyss">
            {/* -scale-x-100 mirrors the preview like a real selfie camera */}
            <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full -scale-x-100 object-cover" />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost !py-2 text-sm">
            Cancel
          </button>
          <button onClick={capture} disabled={!ready || !!error} className="btn-primary !py-2 text-sm">
            Capture
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H21a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" strokeLinejoin="round" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}
