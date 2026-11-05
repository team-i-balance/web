// 배포·PC 적용: 지금 적용된 정책, 직원 PC가 받았는지(적용·거부와 사유), 배포 기록
import { MonitorCheck, RefreshCw, History } from 'lucide-react'
import clsx from 'clsx'
import { S, useStore } from '../../domain/store'
import { acksNow, reasonKo, refreshAcks } from '../../api/policy'
import { Button, Empty, Meter, Tag } from '../../ds'
import { openDialog } from '../dialogs'
import { fmt } from '../../lib/util'
import d from './deploy.module.css'

export default function Deploy() {
  useStore()
  const P = S.policy, a = acksNow(), live = S.api.live
  const hist = [...S.history].filter(h => !live || h.server).reverse()
  const left = a ? a.devices - a.applied - a.rejected : 0
  return (
    <div className={d.wrap}>
      {P.changes.length > 0 && <div className={clsx(d.pending, d.full)}>
        <b>배포 대기 변경 {P.changes.length}개</b><span>서명 후 배포해야 직원 PC에 적용돼요</span>
        <Button variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>
      </div>}

      <section className={d.card} aria-label="지금 적용된 정책">
        <div className={d.ch}><h2>지금 정책</h2>{live ? <Tag tone="ok" dot>서버 기준</Tag> : <Tag dot>예시 데이터</Tag>}</div>
        {P.version === 'v0'
          ? <Empty icon={<MonitorCheck size={20} />} title="아직 배포한 정책이 없어요" text="정책을 고친 뒤 서명 후 배포하면 여기에 보여요" />
          : <>
            <div className={d.ver}><b>{P.version}</b><span>{P.deployed ? `${P.deployed} 배포` : '서버에 배포됨'}</span></div>
            <dl className={d.kv}>
              <dt>서명 키</dt><dd>{live ? S.api.pol?.keyid ?? '—' : 'console-demo'}</dd>
              <dt>규칙</dt><dd>{P.learned.length}개 · 탐지 항목 {P.entities.filter(e => e.on).length}개 켬</dd>
              {live && S.api.pol?.sha && <><dt>번들 해시</dt><dd>{S.api.pol.sha}</dd></>}
            </dl>
          </>}
      </section>

      <section className={d.card} aria-label="PC 적용 현황">
        <div className={d.ch}><h2>PC 적용</h2>{live && <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => refreshAcks()}>새로고침</Button>}</div>
        {!a || !a.devices ? <Empty icon={<MonitorCheck size={20} />} title="아직 받은 PC가 없어요" text="직원 PC가 새 정책을 받으면 여기에 모여요" />
          : <>
            <div className={d.ver}><b>{Math.round((a.applied / a.devices) * 100)}%</b><span>{a.devices}대 중 {a.applied}대 적용</span></div>
            <Meter value={a.applied / a.devices} label="PC 적용 비율" />
            <div className={d.stats}>
              <div className={clsx(d.stat, d.good)}><span>적용</span><b>{a.applied}</b></div>
              <div className={clsx(d.stat, a.rejected > 0 && d.bad)}><span>거부</span><b>{a.rejected}</b></div>
              <div className={d.stat}><span>기다리는 중</span><b>{left}</b></div>
            </div>
            {a.rejected > 0 && <div className={d.reasons}>{Object.entries(a.reject_reasons).map(([k, n]) => <div key={k} className={d.reason}><span>{reasonKo(k)}</span><span>{n}대</span></div>)}</div>}
            <p className={d.note}>PC는 서명과 버전을 확인한 뒤에만 새 정책을 적용해요. 거부한 PC는 지금 정책을 그대로 써요.</p>
          </>}
      </section>

      <section className={clsx(d.card, d.full)} aria-label="배포 기록">
        <div className={d.ch}><h2>배포 기록</h2>{live && <span className={d.note}>서버에 기록 목록이 없어 이 브라우저에서 배포한 것만 보여요</span>}</div>
        {hist.length ? <ol className={d.hist}>{hist.map(h => <li key={h.version + +h.at} className={d.hi}>
          <div className={d.hv}><b>{h.version}</b><span>{fmt(h.at)}</span></div>
          <ul className={d.hc}>{h.changes.map((c, i) => <li key={i}><span>{c.what}</span><em>{c.src}</em></li>)}</ul>
        </li>)}</ol> : <Empty icon={<History size={20} />} title="이 브라우저에서 배포한 기록이 없어요" />}
      </section>
    </div>
  )
}
