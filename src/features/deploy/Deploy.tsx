// 배포·PC 적용: 직원 PC가 받았는지(적용·거부와 사유), 배포 기록
import { Fragment, useEffect, useState } from 'react'
import { MonitorCheck, RefreshCw, History, ChevronDown } from 'lucide-react'
import { S, useStore } from '../../domain/store'
import { acksNow, historyFromServer, loadVersion, reasonKo, refreshAcks, type VersionView } from '../../api/policy'
import { Button, Empty, Meter, Notice, Tag, ds } from '../../ds'
import { openDialog } from '../dialogs'
import { fmt } from '../../lib/util'
import d from './deploy.module.css'

// 변경 문장의 첫 ':' 앞은 라벨, 뒤는 본문으로 나눈다(화면 표시만)
function splitWhat(w: string): [string, string] {
  const i = w.indexOf(':')
  return i > 0 ? [w.slice(0, i).trim(), w.slice(i + 1).trim()] : ['', w]
}

export default function Deploy() {
  useStore()
  const P = S.policy, a = acksNow(), live = S.api.live
  const hist = [...S.history].filter(h => !live || h.server).reverse()
  const left = a ? a.devices - a.applied - a.rejected : 0
  const reasons = a ? Object.entries(a.reject_reasons) : []
  const none = P.version === 'v0'
  return (
    <div className={d.wrap}>
      <div className={ds.pageHead}><h1>배포·PC</h1></div>
      {P.changes.length > 0 && <Notice tone="now" title={`배포 대기 변경 ${P.changes.length}개 · 배포해야 PC에 적용돼요`}
        actions={<Button variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>} />}

      <section className={ds.panel} aria-label="PC 적용 현황">
        <div className={d.ch}>
          <h2>PC 적용{none ? '' : ` · ${P.version}`}{!none && P.deployed && <small>{P.deployed} 배포</small>}</h2>
          {live && <Button className={d.end} size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => refreshAcks()}>새로고침</Button>}
        </div>
        {none ? <Empty icon={<MonitorCheck size={20} />} title="아직 배포한 정책이 없어요" text="정책을 고친 뒤 서명 후 배포하면 여기에 보여요" />
          : !a || !a.devices ? <Empty icon={<MonitorCheck size={20} />} title="아직 받은 PC가 없어요" text="직원 PC가 새 정책을 받으면 여기에 모여요" />
          : <div className={d.top}>
            <div className={d.left}>
              <p className={d.sum}><b className="num">{a.applied} / {a.devices}대</b><span>적용{left > 0 && ` · 기다리는 중 ${left}대`}</span></p>
              <div className={d.bar}><Meter size="md" value={a.applied / a.devices} label="PC 적용 비율" /></div>
            </div>
            {a.rejected > 0 && <Notice tone="warning"
              title={`거부한 PC ${a.rejected}대${reasons.length === 1 ? ` · ${reasonKo(reasons[0][0])}` : ''}`}>
              {reasons.length > 1 && <p className={d.reasons}>{reasons.map(([k, n], i) => <Fragment key={k}>{i > 0 && <span aria-hidden="true">·</span>}<span>{reasonKo(k)} <b>{n}대</b></span></Fragment>)}</p>}
              <p>거부한 PC는 이전 정책을 계속 써요</p>
            </Notice>}
          </div>}
      </section>

      <section className={ds.panel} aria-label="배포 기록">
        <div className={d.ch}><h2>배포 기록</h2>{live && !historyFromServer && <span className={d.note}>서버에 기록 목록이 없어 이 브라우저에서 배포한 것만 보여요</span>}</div>
        {hist.length ? <ol className={d.hist}>{hist.map((h, hi) => <li key={h.version + +h.at} className={d.hi}>
          <div className={d.hv}><b>{h.version}</b><span>{fmt(h.at)}</span>{hi === 0 && h.version === P.version && <Tag tone="now">적용 중</Tag>}</div>
          <ul className={d.hc}>{h.changes.map((c, i) => {
            const [lab, txt] = splitWhat(c.what)
            return <li key={i}>{lab && <span className={d.cl}>{lab}</span>}<span className={d.ct}>{txt}</span>{c.src && <Tag>{c.src}</Tag>}</li>
          })}</ul>
          {live && h.server && <VersionDetail n={+h.version.slice(1)} sha={h.version === P.version ? S.api.pol?.sha : undefined} />}
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
          {n === 1 ? <span>첫 배포</span> : v.changed.length ? <ul className={d.vlist}>{v.changed.map(c => <li key={c}>{c}</li>)}</ul> : <span>바뀐 점 없음</span>}
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
