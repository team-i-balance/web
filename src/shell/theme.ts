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

// 강조색 후보 비교(임시): ?acc=ink·blue·teal·devs. 이 창 안에서는 주소가 바뀌어도 유지하고, ?acc=violet 이면 지금 색으로 돌아온다
const ACC = 'console-acc', ACCS = ['ink', 'blue', 'teal', 'devs']
export function initAccent() {
  const q = new URLSearchParams(location.search).get('acc')
  let v = q
  try { if (q) { if (ACCS.includes(q)) sessionStorage.setItem(ACC, q); else sessionStorage.removeItem(ACC) } else v = sessionStorage.getItem(ACC) } catch { /* 저장소를 못 쓰면 주소만 본다 */ }
  if (v && ACCS.includes(v)) document.documentElement.dataset.acc = v
}
