"use client";

import { useRef, useState } from "react";
import PlayerPhoto from "@/components/player/PlayerPhoto";

interface PlayerPhotoUploadProps {
  playerId: string;
  initialPhoto: string | null;
  playerName: string;
}

export default function PlayerPhotoUpload({
  playerId,
  initialPhoto,
  playerName,
}: PlayerPhotoUploadProps) {
  const [photo, setPhoto] = useState(initialPhoto);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/players/${playerId}/photo`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = await response.text();
        alert(`头像上传失败：${message || "服务器未返回有效结果"}`);
        return;
      }

      const data = await response.json();
      const nextPhoto = `${data.photo}${data.photo.includes("?") ? "&" : "?"}v=${Date.now()}`;
      setPhoto(nextPhoto);
      alert("头像上传成功，页面将自动刷新。");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("头像上传失败，请稍后重试。");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="group relative block rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
        onClick={() => !isUploading && fileInputRef.current?.click()}
        aria-label={photo ? "更换头像" : "上传头像"}
      >
        <PlayerPhoto
          src={photo}
          name={playerName}
          size={160}
          className={`h-32 w-32 border-4 border-slate-700 shadow-xl transition-opacity md:h-40 md:w-40 ${
            isUploading ? "opacity-60" : ""
          }`}
          fallbackClassName="bg-slate-800 border-4 border-slate-700"
          fallbackTextClassName="text-slate-600"
        />
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center rounded-full bg-black/45 text-white transition-opacity ${
            isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          {isUploading ? (
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <svg
                className="mb-1 h-8 w-8 opacity-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              <span className="text-xs font-bold tracking-wider">
                {photo ? "更换头像" : "上传头像"}
              </span>
            </>
          )}
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
