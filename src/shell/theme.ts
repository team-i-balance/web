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

// 새 디자인 비교: ?look=next 로 켜고 ?look=old 로 끈다. 이 창 안에서는 주소가 바뀌어도 유지한다.
const LOOK = 'console-look'
export function initLook() {
  const q = new URLSearchParams(location.search).get('look')
  try { if (q === 'next') sessionStorage.setItem(LOOK, 'next'); else if (q) sessionStorage.removeItem(LOOK) } catch { /* 저장소를 못 쓰면 주소만 본다 */ }
  let on = q === 'next'
  try { on = on || (!q && sessionStorage.getItem(LOOK) === 'next') } catch { /* 위와 같음 */ }
  if (on) document.documentElement.dataset.look = 'next'
}
export const isNext = () => document.documentElement.dataset.look === 'next'
