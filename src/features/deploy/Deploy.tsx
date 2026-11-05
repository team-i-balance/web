// 배포: 서버 탐지가 어느 정책을 쓰는지와 배포 기록. 직원 PC는 입력을 서버로 검사하므로 정책을 따로 받지 않는다
import { useEffect, useState } from 'react'
import { ServerCog, RefreshCw, History, ChevronDown } from 'lucide-react'
import { S, useStore } from '../../domain/store'
import { applyLatest, historyFromServer, lastReject, loadVersion, reasonKo, refreshActive, serverBehind, type VersionView } from '../../api/policy'
import { Button, Empty, Notice, Tag, ds } from '../../ds'
import { openDialog } from '../dialogs'
import { fmt } from '../../lib/util'
import d from './deploy.module.css'

// 변경 문장의 첫 ':' 앞은 라벨, 뒤는 본문으로 나눈다(화면 표시만)
// 서버 감사 주체 'security:이름' → '이름'(backend #59)
const who = (by: string) => by.replace(/^security:/, '')

function splitWhat(w: string): [string, string] {
  const i = w.indexOf(':')
  return i > 0 ? [w.slice(0, i).trim(), w.slice(i + 1).trim()] : ['', w]
}

export default function Deploy() {
  useStore()
  const P = S.policy, live = S.api.live, act = S.api.pol?.active ?? null, behind = serverBehind()
  const hist = [...S.history].filter(h => !live || h.server).reverse()
  const none = P.version === 'v0' || !P.version
  const [busy, setBusy] = useState(false)
  const apply = async () => { setBusy(true); await applyLatest(); setBusy(false) }
  return (
    <div className={d.wrap}>
      <div className={ds.pageHead}><h1>배포</h1></div>
      {P.changes.length > 0 && <Notice tone="now" title={`배포 대기 변경 ${P.changes.length}개 · 배포해야 서버 탐지에 적용돼요`}
        actions={<Button variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>} />}

      <section className={ds.panel} aria-label="서버 적용">
        <div className={d.ch}>
          <h2>서버 탐지에 쓰는 정책</h2>
          {live && <Button className={d.end} size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => refreshActive()}>새로고침</Button>}
        </div>
        {!live ? <Empty icon={<ServerCog size={20} />} title="서버에 연결되지 않았어요" text="연결되면 서버가 쓰는 정책을 보여 줘요" />
          : none ? <Empty icon={<ServerCog size={20} />} title="아직 배포한 정책이 없어요" text="정책을 고친 뒤 서명 후 배포하면 서버 탐지에 바로 적용돼요" />
          : <div className={d.top}>
            <div className={d.left}>
              {/* 활성으로 저장된 버전이 아니라 탐지가 실제로 쓰는 버전(effective)을 크게 보인다(backend #64) */}
              <p className={d.sum}><b className="num">{act?.effective ? `v${act.effective}` : '없음'}</b><span>{act ? `${act.at ? fmt(new Date(act.at)) + ' 적용' : ''}${act.by ? ` · ${who(act.by)}` : ''} · 직원 입력은 모두 이 정책으로 검사해요` : '서버가 아직 어떤 정책도 쓰지 않아요 · 기본 탐지만 해요'}</span></p>
            </div>
            {act && act.effective !== act.version && <Notice tone="error" title={`v${act.version}를 서버가 적용하지 못했어요`}>
              <p>{act.error ? `${reasonKo(act.error.code)} · ${fmt(new Date(act.error.at))}. ` : ''}{act.effective ? `탐지는 이전 v${act.effective}로 하고 있어요.` : '탐지는 정책 없이 하고 있어요.'} 자동 변환 규칙을 고쳐 다시 배포해 주세요.</p>
            </Notice>}
            {S.api.pol?.keySet === false && P.exclude.some(x => /^⟦(h=hmac:|=)/.test(x.term)) && <Notice tone="warning" title="오탐 신고에서 온 탐지 제외가 적용되지 않아요">
              <p>서버에 값 해시 키(POLICY_VALUE_HASH_KEY)가 없어 hmac 탐지 제외를 건너뛰어요. 백엔드에 키를 넣어야 해요.</p>
            </Notice>}
            {behind && act?.effective === act?.version && <Notice tone="warning" title={`최신 배포 ${P.version}가 서버에 적용되지 않았어요`}
              actions={<Button variant="now" disabled={busy} onClick={apply}>{busy ? '적용하는 중…' : `${P.version} 서버에 적용하기`}</Button>}>
              {lastReject?.version === +P.version.slice(1)
                ? <p>서버가 이 버전을 거절했어요({reasonKo(lastReject.reason)}). 다시 적용해도 같은 사유로 거절될 수 있어요.</p>
                : <p>서버에 저장만 되고 적용되지 않은 버전이에요. 적용하기 전에 아래 배포 기록에서 내용을 확인해 주세요.</p>}
            </Notice>}
          </div>}
      </section>

      <section className={ds.panel} aria-label="배포 기록">
        <div className={d.ch}><h2>배포 기록</h2>{live && !historyFromServer && <span className={d.note}>서버에 기록 목록이 없어 이 브라우저에서 배포한 것만 보여요</span>}</div>
        {hist.length ? <ol className={d.hist}>{hist.map(h => <li key={h.version + +h.at} className={d.hi}>
          <div className={d.hv}><b>{h.version}</b><span>{fmt(h.at)}{h.by ? ` · ${who(h.by)}` : ''}</span>{act && h.version === 'v' + act.version && <Tag tone="now">서버 적용 중</Tag>}</div>
          <ul className={d.hc}>{h.changes.map((c, i) => {
            const [lab, txt] = splitWhat(c.what)
            return <li key={i}>{lab && <span className={d.cl}>{lab}</span>}<span className={d.ct}>{txt}</span>{c.src && <Tag>{c.src}</Tag>}</li>
          })}</ul>
          {live && h.server && <VersionDetail n={+h.version.slice(1)} sha={h.sha ?? (h.version === P.version ? S.api.pol?.sha : undefined)} />}
        </li>)}</ol> : <Empty icon={<History size={20} />} title={live && !historyFromServer ? '이 브라우저에서 배포한 기록이 없어요' : '아직 배포한 기록이 없어요'} />}
      </section>
    </div>
  )
}

// 서버에 저장된 버전 내용: 펼칠 때 /policy/{n} 을 받아 앞 버전과 비교한다
function VersionDetail({ n, sha }: { n: number; sha?: string | null }) {
  const [open, setOpen] = useState(false), [v, setV] = useState<VersionView | null>(null), [err, setErr] = useState('')
  useEffect(() => { if (open && !v) loadVersion(n).then(setV, e => setErr(String(e?.message || e))) }, [open, n, v])
  return (
    <div className={d.vd}>
      <Button size="sm" variant="ghost" aria-expanded={open} icon={<ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />} onClick={() => setOpen(o => !o)}>{open ? '내용 접기' : '이 버전 내용 보기'}</Button>
      {open && (err ? <p className={d.note}>버전 내용을 불러오지 못했어요 · {err}</p> : !v ? <p className={d.note}>불러오는 중…</p> : <>
        <div className={d.vchg}>
          <b>앞 버전 대비</b>
          {n === 1 ? <span>첫 배포</span> : !v.compared ? <span>앞 버전을 불러오지 못해 비교하지 못했어요</span> : v.changed.length ? <ul className={d.vlist}>{v.changed.map(c => <li key={c}>{c}</li>)}</ul> : <span>바뀐 점 없음</span>}
        </div>
        <dl className={d.kv}>
          <div><dt>자동 변환 규칙</dt><dd>{v.rules.length ? <ul className={d.vlist}>{v.rules.map((r, i) => <li key={i}>{r.description} → {r.label} {r.action}</li>)}</ul> : '없음'}</dd></div>
          <div><dt>탐지 항목</dt><dd>{v.on}개 켬{v.off.length ? ` · 끔: ${v.off.join(', ')}` : ''}</dd></div>
          <div><dt>회사 고유 단어</dt><dd>{v.dict}개</dd></div>
          <div><dt>탐지 제외</dt><dd>{v.exclude}개</dd></div>
          <div><dt>서명 키</dt><dd className={d.mono}>{v.keyid ?? '—'}</dd></div>
          {sha && <div><dt>번들 해시</dt><dd className={d.mono}>{sha}</dd></div>}
        </dl>
      </>)}
    </div>
  )
}
