// 테마: 저장한 값(라이트/다크)이 없으면 시스템 설정을 따른다.
import { emit } from '../domain/store'

type Theme = 'light' | 'dark'
const KEY = 'console-theme'
const read = (): Theme | null => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null } catch { return null } }

export function initTheme() { const t = read(); if (t) document.documentElement.dataset.theme = t }
export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme
  if (t === 'light' || t === 'dark') return t
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export function toggleTheme() {
  const t: Theme = currentTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.dataset.theme = t
  try { localStorage.setItem(KEY, t) } catch { /* 저장소를 못 쓰면 이번 창에서만 */ }
  emit()
}

// 디자인 비교: ?look=next·carbon·cloudscape 로 켜고 ?look=old 로 끈다. 이 창 안에서는 주소가 바뀌어도 유지한다.
export type Look = 'next' | 'carbon' | 'cloudscape'
const LOOKS: Look[] = ['next', 'carbon', 'cloudscape']
const LOOK = 'console-look'
export function initLook() {
  const q = new URLSearchParams(location.search).get('look')
  const ok = (v: string | null): v is Look => LOOKS.includes(v as Look)
  try { if (ok(q)) sessionStorage.setItem(LOOK, q); else if (q) sessionStorage.removeItem(LOOK) } catch { /* 저장소를 못 쓰면 주소만 본다 */ }
  let v: string | null = q
  try { if (!q) v = sessionStorage.getItem(LOOK) } catch { /* 위와 같음 */ }
  if (ok(v)) document.documentElement.dataset.look = v
}
export const currentLook = () => document.documentElement.dataset.look as Look | undefined
export const isNext = () => currentLook() === 'next'
