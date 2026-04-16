type BrandMarkProps = {
    className?: string;
};

export default function BrandMark({ className = "h-10 w-10" }: BrandMarkProps) {
    return (
        <svg
            viewBox="0 0 64 64"
            aria-hidden="true"
            className={className}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                <linearGradient id="heavy-shell" x1="13" y1="6" x2="49" y2="58" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#2B1B11" />
                    <stop offset="0.42" stopColor="#120B08" />
                    <stop offset="1" stopColor="#040302" />
                </linearGradient>
                <linearGradient id="heavy-rim" x1="11.5" y1="7.5" x2="52.5" y2="57" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFF8DD" />
                    <stop offset="0.18" stopColor="#FFE8AA" />
                    <stop offset="0.44" stopColor="#DCA24C" />
                    <stop offset="0.76" stopColor="#95581F" />
                    <stop offset="1" stopColor="#68380F" />
                </linearGradient>
                <linearGradient id="heavy-rim-shadow" x1="18" y1="16" x2="47" y2="50" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFE3A2" stopOpacity="0.92" />
                    <stop offset="1" stopColor="#6A3E14" stopOpacity="0.2" />
                </linearGradient>
                <radialGradient id="heavy-core" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(32 31.5) rotate(90) scale(22.6 19.8)">
                    <stop stopColor="#39271A" />
                    <stop offset="0.58" stopColor="#17100C" />
                    <stop offset="1" stopColor="#090706" />
                </radialGradient>
                <linearGradient id="heavy-plate" x1="23.6" y1="20.8" x2="40.4" y2="40.8" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#5A3D24" />
                    <stop offset="0.22" stopColor="#F1C772" />
                    <stop offset="0.48" stopColor="#8C5424" />
                    <stop offset="0.78" stopColor="#3B2415" />
                    <stop offset="1" stopColor="#1A120D" />
                </linearGradient>
                <linearGradient id="heavy-crown" x1="22.2" y1="8.4" x2="41.6" y2="21.2" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFF9E4" />
                    <stop offset="0.34" stopColor="#FFD979" />
                    <stop offset="1" stopColor="#B56A21" />
                </linearGradient>
                <linearGradient id="heavy-gem" x1="28.2" y1="8.2" x2="35.6" y2="15.7" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFF8D1" />
                    <stop offset="0.42" stopColor="#F5CB62" />
                    <stop offset="1" stopColor="#AB5B1B" />
                </linearGradient>
                <linearGradient id="heavy-handle" x1="10" y1="18" x2="24" y2="32.5" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFE6AC" />
                    <stop offset="0.48" stopColor="#D4913E" />
                    <stop offset="1" stopColor="#724012" />
                </linearGradient>
                <linearGradient id="heavy-ribbon" x1="16" y1="47" x2="48" y2="57.2" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6C1014" />
                    <stop offset="0.48" stopColor="#B31E27" />
                    <stop offset="1" stopColor="#5B0B10" />
                </linearGradient>
                <linearGradient id="heavy-ribbon-edge" x1="18" y1="47" x2="45" y2="56" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#F7C36F" />
                    <stop offset="1" stopColor="#7F4A1A" />
                </linearGradient>
                <linearGradient id="heavy-hp" x1="23.4" y1="21.2" x2="40.8" y2="42.4" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFF7E1" />
                    <stop offset="0.5" stopColor="#F2C56D" />
                    <stop offset="1" stopColor="#B66B24" />
                </linearGradient>
                <linearGradient id="heavy-pulse" x1="18" y1="34" x2="46" y2="34" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#F0C56F" />
                    <stop offset="0.5" stopColor="#FFFDF4" />
                    <stop offset="1" stopColor="#D99238" />
                </linearGradient>
                <linearGradient id="heavy-sheen" x1="16.8" y1="13.5" x2="39.2" y2="32.2" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#FFFFFF" stopOpacity="0.5" />
                    <stop offset="0.44" stopColor="#FFF1CB" stopOpacity="0.16" />
                    <stop offset="1" stopColor="#FFF1CB" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="heavy-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(29 15) rotate(41) scale(24 16)">
                    <stop stopColor="#FFD36C" stopOpacity="0.34" />
                    <stop offset="1" stopColor="#FFD36C" stopOpacity="0" />
                </radialGradient>
                <filter id="heavy-shadow" x="2" y="2" width="60" height="60" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feDropShadow dx="0" dy="10" stdDeviation="6" floodColor="#000000" floodOpacity="0.5" />
                </filter>
                <filter id="heavy-line-glow" x="14" y="24" width="36" height="21" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                    <feGaussianBlur stdDeviation="1.2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <g filter="url(#heavy-shadow)">
                <path
                    d="M32 6L47.8 11.9L52 24.7V35.1C52 45.72 45 53.7 32 58C19 53.7 12 45.72 12 35.1V24.7L16.2 11.9L32 6Z"
                    fill="url(#heavy-shell)"
                />
                <path
                    d="M32 8L46.5 13.1L50.2 24.8V34.7C50.2 44.09 43.9 51.38 32 55.32C20.1 51.38 13.8 44.09 13.8 34.7V24.8L17.5 13.1L32 8Z"
                    stroke="url(#heavy-rim)"
                    strokeWidth="2.4"
                />
                <path
                    d="M32 10.4L45 15.1L48 25.7V34.1C48 42.04 42.66 48.38 32 51.95C21.34 48.38 16 42.04 16 34.1V25.7L19 15.1L32 10.4Z"
                    stroke="url(#heavy-rim-shadow)"
                    strokeWidth="1.4"
                    strokeOpacity="0.9"
                />
                <path
                    d="M32 12.1L42.9 16.5L46.2 26.2V33.8C46.2 41.22 41.22 47.2 32 50.45C22.78 47.2 17.8 41.22 17.8 33.8V26.2L21.1 16.5L32 12.1Z"
                    fill="url(#heavy-core)"
                />
                <circle cx="29" cy="15" r="15" fill="url(#heavy-glow)" />
                <path
                    d="M19.1 16.4C24.1 12.9 30.8 11.2 39.1 11.8C31.1 14.7 25.5 20 21.2 28.4C19.7 25.3 19 21.4 19.1 16.4Z"
                    fill="url(#heavy-sheen)"
                />

                <path d="M20.7 23.4C16.9 21.6 15.2 18.6 15.4 14.4L19 14.4C18.9 17.4 20.2 19.5 23 21.2L25.2 22.5L22.9 26L20.7 23.4Z" fill="url(#heavy-handle)" fillOpacity="0.92" />
                <path d="M43.3 23.4C47.1 21.6 48.8 18.6 48.6 14.4L45 14.4C45.1 17.4 43.8 19.5 41 21.2L38.8 22.5L41.1 26L43.3 23.4Z" fill="url(#heavy-handle)" fillOpacity="0.92" />

                <path d="M22.2 13.4L26.8 9.1L32 13.1L37.2 9.1L41.8 13.4L40 19H24L22.2 13.4Z" fill="url(#heavy-crown)" />
                <path d="M29.1 9.7L32 7.2L34.9 9.7L34 14.2H30L29.1 9.7Z" fill="url(#heavy-gem)" />
                <path d="M18 19.4L26.4 19.4L21.4 27.8L14.3 24.9L18 19.4Z" fill="#7B4B17" fillOpacity="0.3" />
                <path d="M46 19.4L37.6 19.4L42.6 27.8L49.7 24.9L46 19.4Z" fill="#7B4B17" fillOpacity="0.3" />

                <circle cx="32" cy="31" r="15.2" stroke="url(#heavy-rim)" strokeWidth="1.6" strokeOpacity="0.92" />
                <circle cx="32" cy="31" r="12.7" stroke="#5F3612" strokeOpacity="0.55" strokeWidth="2.1" />
                <circle cx="32" cy="31" r="11.2" fill="url(#heavy-plate)" />
                <path d="M23.5 29.1L32 23.1L40.5 29.1L38.8 38.1L32 41L25.2 38.1L23.5 29.1Z" fill="#130D09" fillOpacity="0.22" />
                <path d="M25.2 22.4L32 19.8L38.8 22.4L40.6 29.3L38.8 37.4L32 40.4L25.2 37.4L23.4 29.3L25.2 22.4Z" stroke="#F6D38A" strokeOpacity="0.24" strokeWidth="1.05" />
                <path d="M27.1 21.9L32 20.3L36.9 21.9" stroke="#FFF8DE" strokeOpacity="0.36" strokeWidth="0.9" strokeLinecap="round" />
                <path d="M24.9 37.7L32 40.8L39.1 37.7" stroke="#7A4318" strokeOpacity="0.34" strokeWidth="0.95" strokeLinecap="round" />

                <path d="M21.4 46.1L32 51.4L42.6 46.1L40.6 42.9L32 47.2L23.4 42.9L21.4 46.1Z" fill="url(#heavy-ribbon)" />
                <path d="M23 45.7L32 50L41 45.7" stroke="url(#heavy-ribbon-edge)" strokeWidth="1.2" strokeLinecap="round" />
                <path d="M18.2 46L22 43.6L25.9 49.1L22.9 50.7L18.2 46Z" fill="#8B1218" fillOpacity="0.76" />
                <path d="M45.8 46L42 43.6L38.1 49.1L41.1 50.7L45.8 46Z" fill="#8B1218" fillOpacity="0.76" />

                <path d="M23.6 21.2H28V40.8L23.6 43.7V21.2Z" fill="url(#heavy-hp)" />
                <path d="M36 21.2H40.4V43.7L36 40.8V21.2Z" fill="url(#heavy-hp)" />
                <path d="M25.1 22L26.9 22V40L25.1 41.2V22Z" fill="#FFFDF4" fillOpacity="0.24" />
                <path d="M37.6 22L39.3 22V39.9L37.6 38.9V22Z" fill="#7D4B16" fillOpacity="0.3" />

                <path
                    d="M19 34L24.1 34L27.5 29.7L30.8 37.5L34.4 31.2L39.1 34L45 34"
                    stroke="url(#heavy-pulse)"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#heavy-line-glow)"
                />
                <path d="M25.7 18.9H38.3" stroke="#FFF3C8" strokeOpacity="0.52" strokeWidth="1" strokeLinecap="round" />
                <path d="M28.7 24L32 22.5L35.3 24" stroke="#FFF6D6" strokeOpacity="0.26" strokeWidth="0.86" strokeLinecap="round" />
                <path d="M22.3 50.8L24.9 48.9" stroke="#F8CA79" strokeOpacity="0.72" strokeWidth="0.92" strokeLinecap="round" />
                <path d="M41.1 48.9L43.7 50.8" stroke="#F8CA79" strokeOpacity="0.72" strokeWidth="0.92" strokeLinecap="round" />
            </g>
        </svg>
    );
}
