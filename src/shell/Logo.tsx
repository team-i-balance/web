// AI 누리 보안 마크: 문장 세 줄 중 가운데가 블록으로 '가려진' 모양(64칸 그리드, 면으로만 구성)
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" fill="currentColor">
      <path d="M8 12H56V20H8Z M8 28H20V36H8Z M8 44H44V52H8Z" />
      <path d="M24 24H56V40H24Z" />
    </svg>
  )
}
