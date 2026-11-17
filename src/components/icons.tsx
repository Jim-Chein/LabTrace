import type { ReactNode } from "react";
import logoUrl from "../assets/logo.svg";

export function Logo({ size = 34 }: { size?: number }) {
  return <img className="logo" src={logoUrl} width={size} height={size} alt="" />;
}

interface IconProps {
  size?: number;
}

function Svg({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

export function DocIcon({ size = 18 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M14 3.8V8h4" stroke="currentColor" strokeWidth="1.7" />
    </Svg>
  );
}

export function FolderIcon({ size = 18 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M3.5 8.2V18a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V9.2a2 2 0 0 0-2-2h-6.2L11 5.2H5.5a2 2 0 0 0-2 2v1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Svg>
  );
}

export function CheckBoxIcon({ size = 18 }: IconProps) {
  return (
    <Svg size={size}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 12.2 10.8 15 16.2 9.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ClockIcon({ size = 18 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 8v4.2l2.6 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function SearchIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronIcon({ size = 14, dir = "down" }: IconProps & { dir?: "down" | "right" | "up" }) {
  const rotate = dir === "right" ? -90 : dir === "up" ? 180 : 0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: `rotate(${rotate}deg)` }} aria-hidden="true">
      <path d="M6 9.5 12 15.5 18 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function PencilIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M4 16.5 15.2 5.3a1.6 1.6 0 0 1 2.3 0l1.2 1.2a1.6 1.6 0 0 1 0 2.3L7.5 20H4v-3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </Svg>
  );
}

export function TrashIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M5 7.5h14M9.5 7.4V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.6M8 7.5l.7 11h6.6l.7-11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DownloadIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 4.5v10M8 11l4 4 4-4M6 19.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function UploadIcon({ size = 16 }: IconProps) {
  return (
    <Svg size={size}>
      <path d="M12 16.5V6.5M8 9.5 12 5.5l4 4M6 19.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function CloudIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M16 32h16.5a7 7 0 0 0 1.2-13.9A9.5 9.5 0 0 0 16.2 16 7.2 7.2 0 0 0 16 32Z" fill="#E7E4FF" stroke="#6C62F6" strokeWidth="1.7" />
      <path d="M24 30V20M20 23.5 24 19.5l4 4" stroke="#6C62F6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SavedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.4 12.2 11 14.7 15.8 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ClipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 12.5 14.2 7.2a3 3 0 0 1 4.2 4.2l-6.6 6.7a4.2 4.2 0 0 1-6-6l6.2-6.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 4v3M16 4v3M4 10h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <span className="ftype xls">X</span>;
  }
  if (["pzfx", "pzf"].includes(ext)) {
    return (
      <span className="ftype prism">
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 12 8 3l5 9H3Z" fill="none" stroke="#fff" strokeWidth="1.4" /></svg>
      </span>
    );
  }
  if (["opju", "opj"].includes(ext)) {
    return (
      <span className="ftype origin">
        <svg width="14" height="14" viewBox="0 0 16 16"><path d="M2 11c2-5 3-5 5-1s3 4 5 0" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </span>
    );
  }
  return <span className="ftype other">F</span>;
}
