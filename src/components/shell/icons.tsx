import type { FeatureIcon } from "@/lib/features/registry";

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** ブランドマーク: 角形の中にチェック付きの文書（白線） */
export function LogoMark({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 4v4h8V4" />
      <path d="m8.5 14 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function MenuIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function SearchIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

function StethoscopeIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M5 4v6a4 4 0 0 0 8 0V4" />
      <path d="M9 14v2a5 5 0 0 0 10 0v-2" />
      <circle cx="19" cy="11" r="2" />
    </svg>
  );
}

function FileReportIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 17v-4M12 17v-6M15 17v-2" />
    </svg>
  );
}

function TargetIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

function TopicsIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h10M4 18h13" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function RankIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function RobotIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4M9 4h6" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
    </svg>
  );
}

function PromptIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

function TrafficIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 17l5-5 4 4 5-6 4 3" />
      <path d="M3 21h18" />
    </svg>
  );
}

function DashboardIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="5" rx="1" />
      <rect x="13" y="10" width="8" height="11" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function KeywordsIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7h18M3 12h12M3 17h8" />
      <circle cx="18" cy="16" r="2.5" />
      <path d="m20 18 2 2" />
    </svg>
  );
}

function PenIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="m12 8 4 4" />
    </svg>
  );
}

function FileTextIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </svg>
  );
}

function SettingsIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

/** 地図のピン */
function MapIcon({ className = "" }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

const ICONS: Record<FeatureIcon, (p: IconProps) => React.JSX.Element> = {
  search: SearchIcon,
  stethoscope: StethoscopeIcon,
  "file-report": FileReportIcon,
  target: TargetIcon,
  topics: TopicsIcon,
  rank: RankIcon,
  robot: RobotIcon,
  prompt: PromptIcon,
  traffic: TrafficIcon,
  dashboard: DashboardIcon,
  keywords: KeywordsIcon,
  pen: PenIcon,
  "file-text": FileTextIcon,
  settings: SettingsIcon,
  map: MapIcon,
};

/** registry の icon キー → 16px 線アイコン */
export function FeatureIconSvg({ icon, className = "h-4 w-4" }: { icon: FeatureIcon; className?: string }) {
  const Icon = ICONS[icon] ?? SearchIcon;
  return <Icon className={className} />;
}
