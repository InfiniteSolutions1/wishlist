"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setAvatar } from "@/app/actions/profile";
import { createBrowserClient } from "@/lib/supabase/browser";

const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MAX_BYTES = 5 * 1024 * 1024;

export function AvatarUploader({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    const extension = TYPES[file.type];
    if (!extension) return setStatus("Please choose a PNG, JPG, WebP or GIF picture.");
    if (file.size > MAX_BYTES) return setStatus("That picture is over 5 MB. Please choose a smaller one.");

    setBusy(true);
    setStatus("Uploading…");
    const path = `${userId}/${crypto.randomUUID()}.${extension}`;
    const supabase = createBrowserClient();
    const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
    const saved = error ? { ok: false } : await setAvatar(path);
    setBusy(false);
    setStatus(saved.ok ? "Picture updated." : "The upload didn't work. Please try again.");
    if (saved.ok) router.refresh();
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label="Choose a profile picture"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />
      <button type="button" className="btn-quiet" disabled={busy} onClick={() => input.current?.click()}>
        Change picture
      </button>
      <p className="mt-2 text-sm text-gray-600" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
