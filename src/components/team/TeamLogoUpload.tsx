"use client";

import { useRef, useState } from "react";
import Image from "next/image";

interface TeamLogoUploadProps {
    teamId: string;
    initialLogo: string | null;
    teamName: string;
    teamRegion: string;
}

function getSafeImg(src: string | null) {
    if (!src) return undefined;
    if (src.startsWith("/")) return src;
    return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}

function getFallbackText(region: string) {
    if (region.includes("LPL")) return "LPL";
    if (region.includes("LCK")) return "LCK";
    if (region.includes("LEC")) return "LEC";
    return "LOGO";
}

export default function TeamLogoUpload({
    teamId,
    initialLogo,
    teamName,
    teamRegion,
}: TeamLogoUploadProps) {
    const [logo, setLogo] = useState(initialLogo);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`/api/teams/${teamId}/logo`, {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                const message = await res.text();
                alert(`LOGO 上传失败：${message || "请稍后重试"}`);
                return;
            }

            const data = await res.json();
            const nextLogo = `${data.logo}${data.logo.includes("?") ? "&" : "?"}v=${Date.now()}`;
            setLogo(nextLogo);
            alert("LOGO 上传成功，页面将自动刷新。");
            window.location.reload();
        } catch (error) {
            console.error(error);
            alert("LOGO 上传失败，请稍后重试。");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <div
            className="w-32 h-32 bg-gray-50 rounded-xl flex items-center justify-center text-5xl shadow-inner p-4 relative group cursor-pointer overflow-hidden border border-gray-100 shrink-0"
            onClick={() => !isUploading && fileInputRef.current?.click()}
        >
            {logo ? (
                <Image
                    src={getSafeImg(logo)!}
                    alt={teamName}
                    fill
                    className={`object-contain p-4 transition-opacity ${isUploading ? "opacity-50" : ""}`}
                    unoptimized
                />
            ) : (
                <span className={`text-base font-bold tracking-wider text-gray-500 transition-opacity ${isUploading ? "opacity-50" : ""}`}>
                    {getFallbackText(teamRegion)}
                </span>
            )}

            <div
                className={`absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity ${isUploading ? "opacity-100" : ""}`}
            >
                {isUploading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                    <>
                        <svg
                            className="w-8 h-8 mb-1 opacity-90"
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
                            {logo ? "更换 LOGO" : "上传 LOGO"}
                        </span>
                    </>
                )}
            </div>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
            />
        </div>
    );
}
