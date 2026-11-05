// 대화상자와 오른쪽 패널(시트). Radix Dialog 가 포커스 가두기·Esc·포커스 되돌리기를 맡는다.
import type { ReactNode } from 'react'
import * as D from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '.'
import o from './overlay.module.css'

interface Props { open: boolean; onClose: () => void; title: string; desc?: ReactNode; children: ReactNode; foot?: ReactNode; sheet?: boolean; wide?: boolean }
export function Modal({ open, onClose, title, desc, children, foot, sheet, wide }: Props) {
  return (
    <D.Root open={open} onOpenChange={v => { if (!v) onClose() }}>
      <D.Portal>
        <D.Overlay className={o.scrim} />
        <D.Content className={clsx(sheet ? o.sheet : o.dialog, wide && o.wide)} aria-describedby={undefined}>
          <div className={o.head}>
            <div><D.Title className={o.title}>{title}</D.Title>{desc && <div className={o.desc}>{desc}</div>}</div>
            <D.Close asChild><Button variant="ghost" size="sm" iconOnly className={o.close} aria-label="닫기" icon={<X size={16} />} /></D.Close>
          </div>
          <div className={o.body}>{children}</div>
          {foot && <div className={o.foot}>{foot}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
